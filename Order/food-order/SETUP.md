# 訂餐系統 — 本機啟動指南

## 1. Firebase 設定（一次性）

### 1-a. 建立 Firebase 專案
1. 前往 https://console.firebase.google.com/
2. 新增專案（可停用 Google Analytics）

### 1-b. 啟用 Authentication
1. Firebase Console → Authentication → 開始使用
2. Sign-in method → 啟用 **Google**、**Facebook**
3. Facebook 需要先到 https://developers.facebook.com/ 建立 App，取得 App ID / App Secret

### 1-c. 建立 Firestore 資料庫
1. Firebase Console → Firestore Database → 建立資料庫
2. 選擇**測試模式**（開發期間用，30 天後需設定 Security Rules）
3. 地區選 asia-east1（台灣最近）

### 1-d. 取得 Service Account 金鑰（後端用）
1. Firebase Console → 專案設定 → 服務帳戶
2. 點「產生新的私密金鑰」→ 下載 JSON
3. 將檔案重新命名為 `serviceAccountKey.json`，放在專案根目錄（food-order/）

### 1-e. 取得 Web 設定（前端用）
1. Firebase Console → 專案設定 → 一般
2. 向下捲動到「您的應用程式」→ 新增 Web 應用程式
3. 複製 firebaseConfig 物件中的各個值

## 2. 設定環境變數

```bash
# 複製範本
cp .env.example .env
```

編輯 `.env`，填入步驟 1-d 和 1-e 的值：

```
FIREBASE_CREDENTIALS_PATH=serviceAccountKey.json
FIREBASE_API_KEY=AIza...
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abc123
```

## 3. 安裝套件並啟動

```bash
cd food-order

# 安裝 Python 套件
pip install -r requirements.txt

# 啟動開發伺服器
python -m uvicorn main:app --reload --port 8000
```

開啟瀏覽器：http://localhost:8000

## 4. API 文件

啟動後可查看互動式 API 文件：
- Swagger UI：http://localhost:8000/docs
- ReDoc：http://localhost:8000/redoc

## 5. 專案結構

```
food-order/
├── main.py                    # 應用程式進入點
├── requirements.txt
├── .env                       # 環境變數（不可 commit）
├── serviceAccountKey.json     # Firebase 金鑰（不可 commit）
├── app/
│   ├── api/v1/routes/
│   │   ├── auth.py            # 登入 / 使用者
│   │   ├── stores.py          # 店家 + 菜單 CRUD
│   │   ├── orders.py          # 訂單下單 / 狀態更新
│   │   └── config.py          # Firebase Web 設定
│   ├── core/
│   │   ├── config.py          # 環境變數設定
│   │   ├── firebase.py        # Firebase 初始化
│   │   └── deps.py            # FastAPI 依賴注入
│   ├── models/                # Pydantic 資料模型
│   └── services/              # 商業邏輯
└── frontend/
    ├── pages/
    │   ├── index.html          # 首頁（店家列表）
    │   ├── store.html          # 店家菜單 + 購物車
    │   ├── orders.html         # 買家訂單查詢
    │   └── merchant.html       # 店家後台
    └── static/js/
        └── firebase-init.js    # 前端 Firebase 共用邏輯
```

## 6. 注意事項

- `serviceAccountKey.json` 和 `.env` 絕對不能上傳到 Git，已加入 .gitignore
- Firestore 測試模式 30 天後需設定 Security Rules
- Facebook 登入需要 HTTPS，本機測試建議先用 Google 登入
