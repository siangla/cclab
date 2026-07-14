# -*- coding: utf-8 -*-
"""
以擴增資料 (DATA/GDM_Model1_ext.csv, 50,000 筆) 重新訓練：
  1. Stacking Classifier  -> 供 Flask 後端使用 (gdm_stacker_ext.joblib)
  2. XGBoost              -> 匯出成 JSON 樹供瀏覽器端 (browser_model.json)

注意：此模型使用【含合成擴增】資料，效能數字僅供工具展示，非論文正式驗證。
"""
import os
import json

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import (
    AdaBoostClassifier,
    GradientBoostingClassifier,
    RandomForestClassifier,
    StackingClassifier,
)
from sklearn.metrics import accuracy_score, roc_auc_score, confusion_matrix, classification_report
from sklearn.model_selection import train_test_split
from lightgbm import LGBMClassifier
from xgboost import XGBClassifier

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "DATA", "GDM_Model1_ext.csv")
MODEL_DIR = os.path.join(BASE, "model")
os.makedirs(MODEL_DIR, exist_ok=True)

FEATURES = ["Age", "Weight", "Height", "BMI", "Ethnicity", "Gravida", "Glucoselevel0minblood"]
TARGET = "GDM"

data = pd.read_csv(DATA)
train_data, test_data = train_test_split(data, test_size=0.2, random_state=42, stratify=data[TARGET])
X_train, y_train = train_data[FEATURES], train_data[TARGET]
X_test, y_test = test_data[FEATURES], test_data[TARGET]

# ---------- 1. Stacking (供 Flask) ----------
meta_rf = RandomForestClassifier(
    criterion="entropy", max_depth=3, max_features=1.0,
    min_samples_leaf=5, min_samples_split=7, n_estimators=50,
    random_state=2, n_jobs=-1,
)
stacker = StackingClassifier(
    estimators=[
        ("Extreme Gradient Boosting", XGBClassifier(random_state=2, eval_metric="logloss")),
        ("Random Forest Classifier", RandomForestClassifier(random_state=2)),
        ("Ada Boost Classifier", AdaBoostClassifier(random_state=2)),
        ("Gradient Boosting Classifier", GradientBoostingClassifier(random_state=2)),
        ("Light Gradient Boosting Machine", LGBMClassifier(random_state=2, verbose=-1)),
    ],
    final_estimator=meta_rf, cv=5, passthrough=True, n_jobs=-1,
)
print("[1/2] 訓練 Stacking Classifier ...")
stacker.fit(X_train, y_train)
s_pred = stacker.predict(X_test)
s_proba = stacker.predict_proba(X_test)[:, 1]
s_acc = accuracy_score(y_test, s_pred)
s_auc = roc_auc_score(y_test, s_proba)
print(f"    Stacking  Accuracy={s_acc:.4f}  AUC={s_auc:.4f}")
print(confusion_matrix(y_test, s_pred))
joblib.dump(stacker, os.path.join(MODEL_DIR, "gdm_stacker_ext.joblib"))

with open(os.path.join(MODEL_DIR, "metrics_ext.json"), "w", encoding="utf-8") as f:
    json.dump({
        "accuracy": s_acc, "auc": s_auc,
        "confusion_matrix": confusion_matrix(y_test, s_pred).tolist(),
        "classification_report": classification_report(y_test, s_pred),
        "features": FEATURES, "n_train": len(train_data), "n_test": len(test_data),
        "n_total": len(data), "synthetic": True,
    }, f, ensure_ascii=False, indent=2)

# ---------- 2. XGBoost -> 瀏覽器 JSON ----------
print("[2/2] 訓練 XGBoost 並匯出瀏覽器 JSON ...")
xgb = XGBClassifier(
    n_estimators=300, max_depth=5, learning_rate=0.1,
    subsample=0.9, colsample_bytree=0.9,
    random_state=2, eval_metric="logloss",
)
xgb.fit(X_train, y_train)
x_pred = xgb.predict(X_test)
x_proba = xgb.predict_proba(X_test)[:, 1]
x_acc = accuracy_score(y_test, x_pred)
x_auc = roc_auc_score(y_test, x_proba)
print(f"    XGBoost   Accuracy={x_acc:.4f}  AUC={x_auc:.4f}")

import xgboost as xgblib

booster = xgb.get_booster()
trees = [json.loads(t) for t in booster.get_dump(dump_format="json")]

FIDX = {name: i for i, name in enumerate(FEATURES)}


def add_fidx(node):
    """遞迴把 split 的特徵名稱轉成整數索引，方便 JS 端 x[idx] 取值。"""
    if "leaf" in node:
        return
    node["fidx"] = FIDX[node["split"]]
    for c in node["children"]:
        add_fidx(c)


f32 = np.float32


def eval_tree(node, x):
    # XGBoost 內部以 float32 比較，JS 端以 Math.fround 對應
    while "leaf" not in node:
        cond = f32(x[node["fidx"]]) < f32(node["split_condition"])
        go = node["yes"] if cond else node["no"]
        node = next(c for c in node["children"] if c["nodeid"] == go)
    return node["leaf"]


for t in trees:
    add_fidx(t)

# 計算固定 base_margin：python margin - sum(leaf) 應為常數
dmat = xgblib.DMatrix(X_test.to_numpy(), feature_names=FEATURES)
dtest_margin = booster.predict(dmat, output_margin=True)

sample = X_test.to_numpy()[:200]
tree_sums = np.array([sum(eval_tree(t, row) for t in trees) for row in sample])
base_margin = float(np.mean(dtest_margin[:200] - tree_sums))
resid = float(np.max(np.abs((dtest_margin[:200] - tree_sums) - base_margin)))
print(f"    base_margin={base_margin:.6f}  (殘差 max={resid:.2e})")


def slim(node):
    """只保留 JS 需要的欄位，縮小檔案。門檻存成精確 float32 值。"""
    if "leaf" in node:
        return {"v": round(node["leaf"], 6)}
    return {
        "f": node["fidx"],
        "t": float(f32(node["split_condition"])),
        "y": slim(next(c for c in node["children"] if c["nodeid"] == node["yes"])),
        "n": slim(next(c for c in node["children"] if c["nodeid"] == node["no"])),
    }


slim_trees = [slim(t) for t in trees]

browser_model = {
    "feature_order": FEATURES,
    "base_margin": base_margin,
    "trees": slim_trees,
    "metrics": {"accuracy": x_acc, "auc": x_auc,
                "n_train": len(train_data), "n_test": len(test_data),
                "n_total": len(data), "synthetic": True},
}
with open(os.path.join(MODEL_DIR, "browser_model.json"), "w", encoding="utf-8") as f:
    json.dump(browser_model, f, ensure_ascii=False, separators=(",", ":"))

# 驗證 JS 端數學：用 slim 樹格式（與 JS 完全相同）重算，確認等於 predict_proba
def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-z))


def eval_slim(node, x):
    while "v" not in node:
        node = node["y"] if f32(x[node["f"]]) < f32(node["t"]) else node["n"]
    return node["v"]


slim_sums = np.array([sum(eval_slim(t, row) for t in slim_trees) for row in sample])
js_proba = sigmoid(base_margin + slim_sums)
maxdiff = float(np.max(np.abs(js_proba - x_proba[:200])))
print(f"    JS(slim樹)-vs-Python predict_proba 最大誤差 = {maxdiff:.2e}")

size_kb = os.path.getsize(os.path.join(MODEL_DIR, "browser_model.json")) / 1024
print(f"    browser_model.json 大小 = {size_kb:.0f} KB")
print("完成。")
