# -*- coding: utf-8 -*-
"""
將 GDM_Model1.csv (12,212 筆真實資料) 擴增至 50,000 筆。

重要聲明：多出來的 ~37,788 筆為【合成擴增資料 (synthetic augmentation)】，
並非真實病患紀錄。合成方式：
  1. 保留全部真實資料。
  2. 新增「東亞」種族代碼 14（中/台/日/韓），滿足亞洲族群分析需求。
  3. 各種族的 GDM 盛行率參考真實資料 + 流行病學文獻（亞洲人 GDM 風險較高，
     整體約 15.5% vs 白人約 7.9%；東亞約 6.9–17%），設定為合理目標比率。
  4. 每一筆合成資料的特徵，是從「相同 GDM 類別」的真實資料重抽樣 (bootstrap)
     並加入微量高斯抖動，因此特徵間的相關結構與真實資料一致
     （空腹血糖仍為最強預測因子）。

此資料集僅供工具展示與 Github 部署，效能數字不可作為論文正式驗證依據。
"""
import os
import numpy as np
import pandas as pd

SEED = 42
rng = np.random.default_rng(SEED)

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "..", "DATA", "GDM_Model1.csv")
OUT = os.path.join(BASE, "..", "DATA", "GDM_Model1_ext.csv")

TARGET_TOTAL = 50000
EAST_ASIAN_CODE = 14

FEATURES = ["Age", "Weight", "Height", "BMI", "Ethnicity", "Gravida", "Glucoselevel0minblood"]

# 各種族目標 GDM 盛行率（融合真實資料 rate 與流行病學文獻）
# 1 NAF,2 GBR,3 WEU,4 OTH,5 IND,6 MEA,7 CAR,8 IRL,9 CAE,10 ASE,11 AFE,12 BGD,13 PAK,14 EAS(東亞)
TARGET_RATE = {
    1: 0.090, 2: 0.070, 3: 0.075, 4: 0.115, 5: 0.150, 6: 0.110, 7: 0.085,
    8: 0.060, 9: 0.080, 10: 0.150, 11: 0.070, 12: 0.190, 13: 0.150, 14: 0.130,
}

# 新增合成資料的種族分布：東亞占大宗（滿足「新增亞洲種族」需求），其餘依真實比例
real = pd.read_csv(SRC)
real_counts = real["Ethnicity"].value_counts().to_dict()
real_total = sum(real_counts.values())

n_synth = TARGET_TOTAL - len(real)
# 45% 給東亞新種族，55% 依真實各族比例分配
eas_share = 0.45
n_eas = int(round(n_synth * eas_share))
n_rest = n_synth - n_eas

ethnicity_alloc = {EAST_ASIAN_CODE: n_eas}
for code, cnt in real_counts.items():
    ethnicity_alloc[code] = ethnicity_alloc.get(code, 0) + int(round(n_rest * cnt / real_total))
# 校正到剛好 n_synth
diff = n_synth - sum(ethnicity_alloc.values())
ethnicity_alloc[EAST_ASIAN_CODE] += diff

# 依 GDM 類別建立特徵抽樣池
pos_pool = real[real.GDM == 1][FEATURES].to_numpy()
neg_pool = real[real.GDM == 0][FEATURES].to_numpy()

col_std = real[["Age", "Weight", "Height", "Gravida", "Glucoselevel0minblood"]].std()
JITTER = {  # 抖動幅度 = 該欄位 std 的比例
    "Age": 0.25, "Weight": 0.25, "Height": 0.20, "Gravida": 0.20, "Glucoselevel0minblood": 0.25,
}
RANGES = {
    "Age": (14, 53), "Weight": (33, 170), "Height": (117, 195),
    "Gravida": (0, 20), "Glucoselevel0minblood": (2.0, 11.5),
}
FIDX = {name: i for i, name in enumerate(FEATURES)}


def sample_rows(n, ethnicity, gdm_rate):
    """為某種族生成 n 筆合成資料。"""
    labels = (rng.random(n) < gdm_rate).astype(int)
    rows = np.empty((n, len(FEATURES)))
    for k, lab in enumerate(labels):
        pool = pos_pool if lab == 1 else neg_pool
        base = pool[rng.integers(len(pool))].copy()
        # 對連續欄位加抖動
        for col in ["Age", "Weight", "Height", "Gravida", "Glucoselevel0minblood"]:
            i = FIDX[col]
            base[i] += rng.normal(0, JITTER[col] * col_std[col])
            lo, hi = RANGES[col]
            base[i] = min(max(base[i], lo), hi)
        base[FIDX["Age"]] = round(base[FIDX["Age"]])
        base[FIDX["Gravida"]] = round(base[FIDX["Gravida"]])
        base[FIDX["Weight"]] = round(base[FIDX["Weight"]], 1)
        base[FIDX["Height"]] = round(base[FIDX["Height"]], 1)
        base[FIDX["Glucoselevel0minblood"]] = round(base[FIDX["Glucoselevel0minblood"]], 2)
        # BMI 由體重/身高重算，維持一致性
        h_m = base[FIDX["Height"]] / 100.0
        base[FIDX["BMI"]] = round(base[FIDX["Weight"]] / (h_m * h_m), 2)
        base[FIDX["Ethnicity"]] = ethnicity
        rows[k] = base
    out = pd.DataFrame(rows, columns=FEATURES)
    out["GDM"] = labels
    return out


parts = [real.copy()]
for code, n in sorted(ethnicity_alloc.items()):
    if n <= 0:
        continue
    parts.append(sample_rows(n, code, TARGET_RATE[code]))

ext = pd.concat(parts, ignore_index=True)
# 型別整理
for c in ["Age", "Ethnicity", "Gravida", "GDM"]:
    ext[c] = ext[c].round().astype(int)
ext = ext.sample(frac=1.0, random_state=SEED).reset_index(drop=True)  # 打散

ext.to_csv(OUT, index=False, encoding="utf-8-sig")

print(f"輸出 {OUT}")
print("總筆數:", len(ext))
print("整體 GDM 比率:", round(ext.GDM.mean(), 4))
print("\n各種族筆數與 GDM 比率:")
g = ext.groupby("Ethnicity").agg(n=("GDM", "size"), rate=("GDM", "mean")).round(4)
print(g.to_string())
print("\n東亞(14) 筆數:", int((ext.Ethnicity == 14).sum()))
