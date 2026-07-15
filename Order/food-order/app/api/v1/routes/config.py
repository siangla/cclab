from fastapi import APIRouter
from app.core.config import get_firebase_web_config

router = APIRouter(tags=["config"])

@router.get("/config")
async def firebase_config():
    """回傳 Firebase Web SDK 設定給前端（不含敏感的 server credentials）"""
    return get_firebase_web_config()
