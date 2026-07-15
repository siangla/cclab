from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from firebase_admin import storage
from app.core.firebase import get_db
from app.core.deps import get_current_user
import uuid, os

router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE = 5 * 1024 * 1024  # 5 MB

async def _upload_to_storage(file: UploadFile, path: str) -> str:
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="圖片不可超過 5 MB")
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="只支援 JPG / PNG / WebP 格式")

    bucket = storage.bucket()
    blob = bucket.blob(path)
    blob.upload_from_string(content, content_type=file.content_type)
    blob.make_public()
    return blob.public_url

@router.post("/store/{store_id}/logo")
async def upload_store_logo(
    store_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    doc = db.collection("stores").document(store_id).get()
    if not doc.exists or doc.to_dict()["owner_id"] != current_user["uid"]:
        raise HTTPException(status_code=403, detail="無權限")

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    url = await _upload_to_storage(file, f"stores/{store_id}/logo.{ext}")
    db.collection("stores").document(store_id).update({"logo_url": url})
    return {"url": url}

@router.post("/store/{store_id}/product/{product_id}/image")
async def upload_product_image(
    store_id: str,
    product_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    doc = db.collection("stores").document(store_id).get()
    if not doc.exists or doc.to_dict()["owner_id"] != current_user["uid"]:
        raise HTTPException(status_code=403, detail="無權限")

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    url = await _upload_to_storage(file, f"stores/{store_id}/products/{product_id}.{ext}")
    db.collection("stores").document(store_id)\
      .collection("products").document(product_id).update({"image_url": url})
    return {"url": url}
