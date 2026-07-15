from fastapi import Header, HTTPException, status
from app.core.firebase import verify_token

async def get_current_user(authorization: str = Header(...)) -> dict:
    """從 Authorization: Bearer <token> 解析並驗證使用者"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="需要 Bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        user = await verify_token(token)
        return user
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token 無效或已過期")

async def require_merchant(current_user: dict = None) -> dict:
    """確認使用者角色為 merchant"""
    from firebase_admin import firestore
    db = firestore.client()
    uid = current_user["uid"]
    doc = db.collection("users").document(uid).get()
    if not doc.exists or doc.to_dict().get("role") != "merchant":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要店家權限")
    return {**current_user, **doc.to_dict()}
