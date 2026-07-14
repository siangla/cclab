# -*- coding: utf-8 -*-
"""
產生可掛在 GitHub Pages 的【純靜態】頁面 (docs/index.html)。
- 重用 Flask 版的馬卡龍樣式 (從 templates/index.html 取出 <style> 區塊)
- 內嵌 XGBoost 模型 (browser_model.json)，於瀏覽器端以 JavaScript 推論
- 不需要伺服器，雙擊或 GitHub Pages 皆可運作
"""
import os
import re
import json

BASE = os.path.dirname(os.path.abspath(__file__))
# repo 根目錄為 gdm_webapp 的上一層；靜態頁輸出至 <repo>/docs/index.html
OUT = os.path.join(BASE, "..", "docs", "index.html")

# 取出 Flask 模板的 <style> 區塊（純 CSS，無 Jinja）
with open(os.path.join(BASE, "templates", "index.html"), encoding="utf-8") as f:
    tpl = f.read()
style = re.search(r"<style>.*?</style>", tpl, re.S).group(0)

# 讀取瀏覽器模型
with open(os.path.join(BASE, "model", "browser_model.json"), encoding="utf-8") as f:
    model_raw = f.read()
model = json.loads(model_raw)
m = model["metrics"]

ETHNICITY = [
    (14, "EAS - 東亞（中/台/日/韓）"),
    (1, "NAF - 北大西洋自由貿易區"), (2, "GBR - 英國"), (3, "WEU - 西歐聯盟"),
    (4, "OTH - 其他"), (5, "IND - 印度"), (6, "MEA - 中東及北非地區"),
    (7, "CAR - 中非共和國"), (8, "IRL - 愛爾蘭"), (9, "CAE - 中央美洲"),
    (10, "ASE - 東南亞國協"), (11, "AFE - 非洲經濟區"), (12, "BGD - 孟加拉"),
    (13, "PAK - 巴基斯坦"),
]
options_html = '\n'.join(
    f'                  <option value="{c}">{lbl}</option>' for c, lbl in ETHNICITY
)

acc_pct = round(m["accuracy"] * 100, 2)
auc = round(m["auc"], 4)

html = f"""<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>妊娠糖尿病風險評估</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;600;700&family=Noto+Sans+TC:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
{style}
</head>
<body>
<div class="sheet">

  <div class="masthead">
    <p class="eyebrow">碩士論文研究工具 · 妊娠糖尿病篩檢評估</p>
    <h1>妊娠糖尿病（GDM）風險評估表</h1>
    <p class="desc">填入孕婦基本資料與臨床數值，模型將於您的瀏覽器中即時推估妊娠糖尿病之風險機率（無需連線伺服器）。</p>
  </div>

  <div class="layout">

    <aside class="sidebar">
      <div class="sidebar-block">
        <h2>使用模型</h2>
        <p class="model-name">
          <b>XGBoost</b>（梯度提升樹）<br>
          300 棵樹・於瀏覽器端 JavaScript 推論
        </p>
      </div>

      <div class="sidebar-block">
        <h2>Holdout 表現</h2>
        <ul class="vitals">
          <li><span class="k">準確率 Accuracy</span><span class="v">{acc_pct}%</span></li>
          <li><span class="k">AUC</span><span class="v">{auc}</span></li>
          <li><span class="k">總資料量 n</span><span class="v">{m['n_total']}</span></li>
          <li><span class="k">測試集 n</span><span class="v">{m['n_test']}</span></li>
        </ul>
      </div>

      <div class="sidebar-block">
        <h2>資料來源</h2>
        <p class="source-note">
          原始資料集：<a href="https://figshare.com/articles/dataset/GDM_Dataset_xlsx/21806472/1?file=38695140" target="_blank" rel="noopener">GDM_Dataset.xlsx</a>（Figshare, 2023）<br>
          訓練用檔案：<code>DATA/GDM_Model1_ext.csv</code>
        </p>
        <p class="synthetic-note">⚠ 此版本含<strong>合成擴增資料</strong>（原始 12,212 筆 → 擴增至 {m['n_total']} 筆，並新增「東亞」族群），效能數字僅供工具展示，非論文正式驗證數據。</p>
      </div>
    </aside>

    <div class="chart-col">

      <div class="result" id="result" style="display:none;">
        <div class="result-head">
          <div>
            <div class="result-title">評估結果</div>
            <div class="verdict" id="verdict"></div>
          </div>
          <div class="gauge-score"><span id="score">0</span><span class="pct">% 陽性機率</span></div>
        </div>
        <div class="gauge-wrap">
          <div class="gauge-track">
            <div class="gauge-zone low"></div>
            <div class="gauge-zone mid"></div>
            <div class="gauge-zone high"></div>
            <div class="gauge-marker" id="marker" data-pct=""></div>
          </div>
          <div class="gauge-labels">
            <span>低風險 0–30%</span>
            <span>中度 30–60%</span>
            <span>高風險 60–100%</span>
          </div>
        </div>
        <div class="caveat">
          本工具僅為碩士論文研究之篩檢輔助模型，訓練資料存在類別不平衡問題，對於真陽性個案的召回率（Recall）偏低，代表仍有部分真實陽性個案可能被判定為陰性。<strong>此結果僅供參考，不能取代醫療院所之口服葡萄糖耐受試驗（OGTT）與專業醫師診斷。</strong>
        </div>
      </div>

      <form id="gdm-form" novalidate>
        <fieldset class="chart-section">
          <legend class="section-label">基本資料</legend>
          <div class="row-grid">
            <div class="field">
              <label for="age">年齡 <span class="unit">歲</span></label>
              <input type="number" id="age" min="15" max="55" step="1" required>
            </div>
            <div class="field">
              <label for="gravida">孕次 Gravida <span class="unit">含本胎次數</span></label>
              <input type="number" id="gravida" min="0" max="20" step="1" required>
            </div>
            <div class="field">
              <label for="weight">體重 <span class="unit">公斤</span></label>
              <input type="number" id="weight" min="30" max="200" step="0.1" required>
            </div>
            <div class="field">
              <label for="height">身高 <span class="unit">公分</span></label>
              <input type="number" id="height" min="120" max="200" step="0.1" required>
            </div>
            <div class="field">
              <label for="bmi">BMI</label>
              <input type="number" id="bmi" min="10" max="70" step="0.01" required>
              <span class="bmi-hint" id="bmi-hint">依體重／身高自動計算，可手動修改</span>
            </div>
            <div class="field">
              <label for="ethnicity">種族／國籍分類</label>
              <select id="ethnicity" required>
                <option value="" disabled selected>請選擇</option>
{options_html}
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset class="chart-section">
          <legend class="section-label">臨床數值</legend>
          <div class="row-grid">
            <div class="field full">
              <label for="glucose">空腹血糖值 <span class="unit">mmol/L，OGTT 0 分鐘</span></label>
              <input type="number" id="glucose" min="2" max="15" step="0.01" required>
            </div>
          </div>
        </fieldset>

        <div class="submit-row">
          <button type="submit">開始評估</button>
          <span class="submit-hint">送出後即於瀏覽器計算風險機率</span>
        </div>
        <div class="error-box" id="error" style="display:none; margin-top:16px;"></div>
      </form>

      <footer>GDM RISK CHART — 東海大學碩士論文研究工具 · 僅供學術與篩檢參考</footer>
    </div>
  </div>
</div>

<script id="gdm-model" type="application/json">{model_raw}</script>
<script>
  const MODEL = JSON.parse(document.getElementById('gdm-model').textContent);
  const ORDER = MODEL.feature_order; // ["Age","Weight","Height","BMI","Ethnicity","Gravida","Glucoselevel0minblood"]

  // XGBoost 內部以 float32 比較，用 Math.fround 完全對應 Python 端結果
  function predictProba(x) {{
    let margin = MODEL.base_margin;
    const fr = Math.fround;
    for (let i = 0; i < MODEL.trees.length; i++) {{
      let node = MODEL.trees[i];
      while (node.v === undefined) {{
        node = (fr(x[node.f]) < fr(node.t)) ? node.y : node.n;
      }}
      margin += node.v;
    }}
    return 1 / (1 + Math.exp(-margin));
  }}

  const $ = (id) => document.getElementById(id);
  const weightEl = $('weight'), heightEl = $('height'), bmiEl = $('bmi'), bmiHint = $('bmi-hint');
  let bmiManuallyEdited = false;

  function computeBMI() {{
    const w = parseFloat(weightEl.value), h = parseFloat(heightEl.value);
    if (w > 0 && h > 0) {{
      const bmi = w / Math.pow(h / 100, 2);
      if (!bmiManuallyEdited) bmiEl.value = bmi.toFixed(2);
      bmiHint.textContent = '依體重／身高計算值：' + bmi.toFixed(2);
    }}
  }}
  weightEl.addEventListener('input', computeBMI);
  heightEl.addEventListener('input', computeBMI);
  bmiEl.addEventListener('input', () => {{ bmiManuallyEdited = true; }});

  $('gdm-form').addEventListener('submit', (e) => {{
    e.preventDefault();
    const err = $('error');
    err.style.display = 'none';

    const vals = {{
      Age: parseFloat($('age').value),
      Weight: parseFloat(weightEl.value),
      Height: parseFloat(heightEl.value),
      BMI: parseFloat(bmiEl.value),
      Ethnicity: parseInt($('ethnicity').value, 10),
      Gravida: parseFloat($('gravida').value),
      Glucoselevel0minblood: parseFloat($('glucose').value),
    }};
    for (const k of ORDER) {{
      if (vals[k] === undefined || Number.isNaN(vals[k])) {{
        err.textContent = '請確認所有欄位皆已正確填寫。';
        err.style.display = 'block';
        return;
      }}
    }}

    const x = ORDER.map((k) => vals[k]);
    const proba = predictProba(x);
    const pct = Math.round(proba * 1000) / 10;
    const high = proba >= 0.5;

    $('verdict').textContent = high ? '較高風險 · 建議進一步檢查' : '較低風險';
    $('verdict').className = 'verdict ' + (high ? 'high' : 'low');
    $('score').textContent = pct;
    const marker = $('marker');
    marker.style.left = pct + '%';
    marker.setAttribute('data-pct', pct + '%');
    $('result').style.display = 'block';
    $('result').scrollIntoView({{ behavior: 'smooth', block: 'start' }});
  }});
</script>
</body>
</html>
"""

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

size_kb = os.path.getsize(OUT) / 1024
print(f"已產生 {OUT}  ({size_kb:.0f} KB)")
