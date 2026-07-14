# 妊娠糖尿病（GDM）風險預測工具

依孕婦基本資料與空腹血糖等臨床數值，預測妊娠糖尿病（Gestational Diabetes Mellitus, GDM）之風險機率。本專案為東海大學碩士論文之延伸應用工具，提供兩種版本：

| 版本 | 位置 | 執行方式 | 模型 |
|---|---|---|---|
| **靜態網頁（GitHub Pages）** | [`docs/index.html`](docs/index.html) | 用 GitHub 網址直接開啟，於瀏覽器端即時推論 | XGBoost（匯出為 JSON，JavaScript 推論） |
| **Flask 網頁（本機）** | [`gdm_webapp/`](gdm_webapp/) | `python gdm_webapp/app.py` | Stacking Classifier（XGBoost + RF + AdaBoost + GBM + LightGBM，meta = RF） |

---

## 🔗 線上使用（GitHub Pages）

啟用 Pages 後即可用以下網址開啟（將 `<帳號>` 換成你的 GitHub 帳號）：

```
https://<帳號>.github.io/gdm-predictor/
```

靜態版把模型內嵌在網頁中，**不需要伺服器、不需要後端**，開啟即可預測。

### 如何啟用 GitHub Pages
1. 把本專案推到 GitHub（見下方「部署」）。
2. 進到 repo 的 **Settings → Pages**。
3. **Source** 選 `Deploy from a branch`，Branch 選 `main`，資料夾選 **`/docs`**，按 Save。
4. 等待約 1 分鐘，Pages 會給出上述網址。

---

## 💻 本機執行 Flask 版

```bash
pip install -r requirements.txt
python gdm_webapp/app.py
# 開啟 http://127.0.0.1:5000
```

---

## 輸入欄位

| 欄位 | 說明 | 單位 |
|---|---|---|
| Age | 年齡 | 歲 |
| Weight | 體重 | 公斤 |
| Height | 身高 | 公分 |
| BMI | 身體質量指數（可由體重／身高自動計算） | kg/m² |
| Ethnicity | 種族／國籍分類（代碼 1–14） | — |
| Gravida | 孕次（含本胎） | 次 |
| Glucoselevel0minblood | 空腹血糖值（OGTT 0 分鐘） | mmol/L |

**種族代碼**：1 NAF、2 GBR、3 WEU、4 OTH、5 IND、6 MEA、7 CAR、8 IRL、9 CAE、10 ASE、11 AFE、12 BGD、13 PAK、**14 EAS（東亞：中/台/日/韓，本工具新增）**。

輸出為 GDM 陽性機率（0–100%）；≥ 50% 判定為較高風險。

---

## 資料來源與合成擴增聲明

- 原始資料集：[GDM_Dataset.xlsx（Figshare, 2023）](https://figshare.com/articles/dataset/GDM_Dataset_xlsx/21806472/1?file=38695140)。
- 論文原始模型使用真實資料 `DATA/GDM_Model1.csv`（12,212 筆），對應 `notebooks/pycaret_無血壓model.ipynb`。
- ⚠ **本工具目前部署的模型使用「合成擴增資料」`DATA/GDM_Model1_ext.csv`（50,000 筆）**：保留全部 12,212 筆真實資料，另以「相同 GDM 類別重抽樣 + 微量抖動」生成合成樣本，各族群 GDM 盛行率參考流行病學文獻（亞洲人風險較高），並新增「東亞」族群。
- **合成擴增版的效能數字（Accuracy／AUC）僅供工具展示，不可作為碩士論文正式驗證依據。** 論文正式效能請以真實資料模型為準。

---

## 重現流程

```bash
pip install -r requirements.txt
# 1) 產生 50,000 筆擴增資料
python gdm_webapp/generate_data.py
# 2) 重新訓練 Stacking（Flask 用）與 XGBoost（瀏覽器用），並匯出 browser_model.json
python gdm_webapp/train_ext.py
# 3) 產生靜態網頁 docs/index.html
python gdm_webapp/build_static.py
```

`train_model.py` 為原始真實資料（12,212 筆）的訓練腳本，供對照。

---

## 免責聲明

本工具為學術研究與篩檢輔助用途，**不能取代醫療院所之口服葡萄糖耐受試驗（OGTT）與專業醫師診斷**。因訓練資料類別不平衡，對真陽性個案仍可能有漏判。
