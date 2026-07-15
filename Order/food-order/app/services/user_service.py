from firebase_admin import firestore
from app.models.user import UserCreate, UserRole
from datetime import datetime, timezone

def get_or_create_user(db, uid: str, claims: dict) -> dict:
    """登入後確保 Firestore 有使用者文件"""
    ref = db.collection("users").document(uid)
    doc = ref.get()
    if doc.exists:
        ref.update({"last_login_at": datetime.now(timezone.utc)})
        return doc.to_dict()

    user_data = {
        "uid": uid,
        "display_name": claims.get("name") or claims.get("email", "").split("@")[0],
        "email": claims.get("email"),
        "photo_url": claims.get("picture"),
        "role": UserRole.buyer.value,
        "phone": None,
        "linked_providers": [claims.get("firebase", {}).get("sign_in_provider", "unknown")],
        "created_at": datetime.now(timezone.utc),
        "last_login_at": datetime.now(timezone.utc),
    }
    ref.set(user_data)
    return user_data

def get_user(db, uid: str) -> dict | None:
    doc = db.collection("users").document(uid).get()
    return doc.to_dict() if doc.exists else None
