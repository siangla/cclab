import firebase_admin
from firebase_admin import credentials, firestore, auth
from app.core.config import settings
import os, json

_app = None

def init_firebase():
    global _app
    if _app:
        return
    try:
        # Railway 上用環境變數 FIREBASE_SERVICE_ACCOUNT_JSON（JSON 字串）
        sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if sa_json:
            cred = credentials.Certificate(json.loads(sa_json))
        else:
            cred = credentials.Certificate(settings.firebase_credentials_path)
        _app = firebase_admin.initialize_app(cred, {
            "storageBucket": settings.firebase_storage_bucket,
        })
    except Exception as e:
        print(f"[Firebase] 初始化失敗: {e}")
        raise

def get_db():
    return firestore.client()

async def verify_token(id_token: str) -> dict:
    """驗證 Firebase ID Token，回傳 decoded claims"""
    decoded = auth.verify_id_token(id_token)
    return decoded
