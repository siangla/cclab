# 重現 程式/pycaret_無血壓model.ipynb 的最佳模型
# 資料集: DATA/GDM_Model1.csv (無血壓特徵版本，表現最佳)
# 模型: StackingClassifier(XGBoost + RandomForest + AdaBoost + GradientBoosting + LightGBM, meta=RandomForest)
# 對照 notebook 中列印出的 tune_model 後之 meta-RF 超參數與五個 base estimator 的 session_id=2 設定

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
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from lightgbm import LGBMClassifier
from xgboost import XGBClassifier

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "..", "DATA", "GDM_Model1.csv")
MODEL_DIR = os.path.join(BASE_DIR, "model")
os.makedirs(MODEL_DIR, exist_ok=True)

FEATURES = ["Age", "Weight", "Height", "BMI", "Ethnicity", "Gravida", "Glucoselevel0minblood"]
TARGET = "GDM"

data = pd.read_csv(DATA_PATH)
train_data, test_data = train_test_split(data, test_size=0.2, random_state=42)

X_train, y_train = train_data[FEATURES], train_data[TARGET]
X_test, y_test = test_data[FEATURES], test_data[TARGET]

xgboost = XGBClassifier(random_state=2, eval_metric="logloss")
rf = RandomForestClassifier(random_state=2)
ada = AdaBoostClassifier(random_state=2)
gbc = GradientBoostingClassifier(random_state=2)
lightgbm = LGBMClassifier(random_state=2, verbose=-1)

# tune_model(stacker1_3) 印出的 meta model 調校後超參數
meta_rf = RandomForestClassifier(
    criterion="entropy",
    max_depth=3,
    max_features=1.0,
    min_samples_leaf=5,
    min_samples_split=7,
    n_estimators=50,
    random_state=2,
    n_jobs=-1,
)

stacker = StackingClassifier(
    estimators=[
        ("Extreme Gradient Boosting", xgboost),
        ("Random Forest Classifier", rf),
        ("Ada Boost Classifier", ada),
        ("Gradient Boosting Classifier", gbc),
        ("Light Gradient Boosting Machine", lightgbm),
    ],
    final_estimator=meta_rf,
    cv=5,
    passthrough=True,
    stack_method="auto",
    n_jobs=-1,
)

print("訓練中...")
stacker.fit(X_train, y_train)

pred_label = stacker.predict(X_test)
pred_proba = stacker.predict_proba(X_test)[:, 1]

acc = accuracy_score(y_test, pred_label)
auc = roc_auc_score(y_test, pred_proba)
cm = confusion_matrix(y_test, pred_label)
report = classification_report(y_test, pred_label)

print(f"Accuracy: {acc:.4f}")
print(f"AUC: {auc:.4f}")
print("Confusion matrix:")
print(cm)
print("Classification report:")
print(report)

joblib.dump(stacker, os.path.join(MODEL_DIR, "gdm_stacker.joblib"))

metrics = {
    "accuracy": acc,
    "auc": auc,
    "confusion_matrix": cm.tolist(),
    "classification_report": report,
    "features": FEATURES,
    "n_train": len(train_data),
    "n_test": len(test_data),
}
with open(os.path.join(MODEL_DIR, "metrics.json"), "w", encoding="utf-8") as f:
    json.dump(metrics, f, ensure_ascii=False, indent=2)

print("模型已儲存至", os.path.join(MODEL_DIR, "gdm_stacker.joblib"))
