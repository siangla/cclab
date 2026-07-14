import os
import json

import joblib
import pandas as pd
from flask import Flask, render_template, request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 使用【含合成擴增資料 (50,000 筆)】重新訓練的 Stacking 模型
MODEL_PATH = os.path.join(BASE_DIR, "model", "gdm_stacker_ext.joblib")
METRICS_PATH = os.path.join(BASE_DIR, "model", "metrics_ext.json")

FEATURES = ["Age", "Weight", "Height", "BMI", "Ethnicity", "Gravida", "Glucoselevel0minblood"]

ETHNICITY_OPTIONS = [
    (14, "EAS - 東亞（中/台/日/韓）"),
    (1, "NAF - 北大西洋自由貿易區"),
    (2, "GBR - 英國"),
    (3, "WEU - 西歐聯盟"),
    (4, "OTH - 其他"),
    (5, "IND - 印度"),
    (6, "MEA - 中東及北非地區"),
    (7, "CAR - 中非共和國"),
    (8, "IRL - 愛爾蘭"),
    (9, "CAE - 中央美洲"),
    (10, "ASE - 東南亞國協"),
    (11, "AFE - 非洲經濟區"),
    (12, "BGD - 孟加拉"),
    (13, "PAK - 巴基斯坦"),
]

app = Flask(__name__)
model = joblib.load(MODEL_PATH)
with open(METRICS_PATH, encoding="utf-8") as f:
    metrics = json.load(f)


@app.route("/", methods=["GET", "POST"])
def index():
    result = None
    form_values = {}

    if request.method == "POST":
        form_values = request.form.to_dict()
        try:
            row = {
                "Age": float(request.form["age"]),
                "Weight": float(request.form["weight"]),
                "Height": float(request.form["height"]),
                "BMI": float(request.form["bmi"]),
                "Ethnicity": int(request.form["ethnicity"]),
                "Gravida": int(request.form["gravida"]),
                "Glucoselevel0minblood": float(request.form["glucose"]),
            }
            X = pd.DataFrame([row], columns=FEATURES)
            proba = float(model.predict_proba(X)[0, 1])
            label = int(model.predict(X)[0])
            result = {
                "label": label,
                "proba": proba,
                "proba_pct": round(proba * 100, 1),
            }
        except (KeyError, ValueError) as exc:
            result = {"error": f"輸入資料有誤，請確認所有欄位皆已正確填寫。({exc})"}

    return render_template(
        "index.html",
        ethnicity_options=ETHNICITY_OPTIONS,
        result=result,
        form_values=form_values,
        metrics=metrics,
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000)
