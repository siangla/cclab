from fastapi import APIRouter, Depends, HTTPException
from app.core.firebase import get_db, verify_token
from app.core.deps import get_current_user
from app.services.user_service import get_or_create_user
from app.core.utils import serialize_doc
from datetime import datetime, timezone

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login")
async def login(body: dict):
    """前端登入後呼叫此 endpoint，傳入 Firebase ID Token，後端建立/更新使用者文件"""
    id_token = body.get("id_token")
    if not id_token:
        raise HTTPException(status_code=400, detail="缺少 id_token")
    claims = await verify_token(id_token)
    db = get_db()
    user = get_or_create_user(db, claims["uid"], claims)
    return {"user": serialize_doc(user)}

@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """取得目前登入的使用者資料"""
    from app.services.user_service import get_user
    db = get_db()
    user = get_user(db, current_user["uid"])
    if not user:
        raise HTTPException(status_code=404, detail="使用者不存在")
    return serialize_doc(user)

@router.patch("/profile")
async def update_profile(body: dict, current_user: dict = Depends(get_current_user)):
    """更新使用者聯絡資訊（姓名、電話）"""
    db = get_db()
    uid = current_user["uid"]
    updates = {}
    if "contact_name" in body:
        updates["contact_name"] = (body["contact_name"] or "").strip()
    if "contact_phone" in body:
        updates["contact_phone"] = (body["contact_phone"] or "").strip()
    if not updates:
        raise HTTPException(status_code=400, detail="沒有可更新的欄位")
    updates["updated_at"] = datetime.now(timezone.utc)
    db.collection("users").document(uid).update(updates)
    user = db.collection("users").document(uid).get()
    return serialize_doc(user.to_dict())
