from fastapi import APIRouter, Depends, HTTPException
from app.core.firebase import get_db
from app.core.deps import get_current_user
from app.core.utils import serialize_doc
from app.models.store import StoreCreate, StoreUpdate
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/stores", tags=["stores"])

@router.get("")
async def list_stores():
    db = get_db()
    stores = db.collection("stores").where("status", "==", "active").stream()
    return [serialize_doc(s.to_dict()) for s in stores]

@router.get("/mine")
async def my_store(current_user: dict = Depends(get_current_user)):
    """店家主人取得自己的店（不論 status）"""
    db = get_db()
    stores = list(db.collection("stores").where("owner_id", "==", current_user["uid"]).limit(1).stream())
    if not stores:
        return None
    return serialize_doc(stores[0].to_dict())

@router.get("/{store_id}")
async def get_store(store_id: str):
    db = get_db()
    doc = db.collection("stores").document(store_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="店家不存在")
    return serialize_doc(doc.to_dict())

@router.post("")
async def create_store(body: StoreCreate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = current_user["uid"]
    existing = list(db.collection("stores").where("owner_id", "==", uid).limit(1).stream())
    if existing:
        raise HTTPException(status_code=400, detail="您已有一間店家")

    store_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    store_data = {
        "store_id": store_id,
        "owner_id": uid,
        "status": "pending",
        "is_open": False,
        "created_at": now,
        **body.model_dump(),
    }
    db.collection("stores").document(store_id).set(store_data)
    return serialize_doc(store_data)

@router.patch("/{store_id}")
async def update_store(store_id: str, body: StoreUpdate,
                       current_user: dict = Depends(get_current_user)):
    db = get_db()
    doc = db.collection("stores").document(store_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="店家不存在")
    if doc.to_dict()["owner_id"] != current_user["uid"]:
        raise HTTPException(status_code=403, detail="無權限")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc)
    db.collection("stores").document(store_id).update(updates)
    return {"ok": True}

# ── 商品管理 ────────────────────────────────────────────────────

@router.get("/{store_id}/products")
async def list_products(store_id: str):
    db = get_db()
    products = db.collection("stores").document(store_id)\
                 .collection("products").stream()
    return [serialize_doc(p.to_dict()) for p in products]

@router.post("/{store_id}/products")
async def create_product(store_id: str, body: dict,
                         current_user: dict = Depends(get_current_user)):
    from app.models.product import ProductCreate
    product = ProductCreate(**body)
    db = get_db()

    store_doc = db.collection("stores").document(store_id).get()
    if not store_doc.exists:
        raise HTTPException(status_code=404, detail="店家不存在")
    if store_doc.to_dict()["owner_id"] != current_user["uid"]:
        raise HTTPException(status_code=403, detail="無權限")

    product_ref = db.collection("stores").document(store_id)\
                    .collection("products").document()
    data = {
        "product_id": product_ref.id,
        "store_id": store_id,
        "created_at": datetime.now(timezone.utc),
        **product.model_dump(),
    }
    data["options"] = [o.model_dump() for o in product.options]
    product_ref.set(data)
    return serialize_doc(data)

@router.patch("/{store_id}/products/{product_id}")
async def update_product(store_id: str, product_id: str, body: dict,
                         current_user: dict = Depends(get_current_user)):
    db = get_db()
    store_doc = db.collection("stores").document(store_id).get()
    if not store_doc.exists or store_doc.to_dict()["owner_id"] != current_user["uid"]:
        raise HTTPException(status_code=403, detail="無權限")

    from app.models.product import ProductUpdate
    updates = ProductUpdate(**body)
    update_dict = updates.model_dump(exclude_unset=True)
    if "options" in update_dict and updates.options:
        update_dict["options"] = [o.model_dump() for o in updates.options]
    update_dict["updated_at"] = datetime.now(timezone.utc)

    db.collection("stores").document(store_id)\
      .collection("products").document(product_id).update(update_dict)
    return {"ok": True}

@router.delete("/{store_id}/products/{product_id}")
async def delete_product(store_id: str, product_id: str,
                         current_user: dict = Depends(get_current_user)):
    db = get_db()
    store_doc = db.collection("stores").document(store_id).get()
    if not store_doc.exists or store_doc.to_dict()["owner_id"] != current_user["uid"]:
        raise HTTPException(status_code=403, detail="無權限")

    db.collection("stores").document(store_id)\
      .collection("products").document(product_id).delete()
    return {"ok": True}
