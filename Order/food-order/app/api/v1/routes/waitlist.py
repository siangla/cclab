from fastapi import APIRouter, Depends, HTTPException
from app.core.firebase import get_db
from app.core.deps import get_current_user
from app.core.utils import serialize_doc
from app.services.order_service import create_order
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/waitlist", tags=["waitlist"])


@router.post("")
async def join_waitlist(body: dict, current_user: dict = Depends(get_current_user)):
    """買家加入候補"""
    store_id = body.get("store_id")
    product_id = body.get("product_id")
    qty = int(body.get("qty", 1))
    contact_name = body.get("contact_name", "").strip()
    contact_phone = body.get("contact_phone", "").strip()
    pickup_date = body.get("pickup_date") or None
    pickup_hour = body.get("pickup_hour")
    if pickup_hour is not None:
        pickup_hour = int(pickup_hour)

    if not contact_name or not contact_phone:
        raise HTTPException(status_code=400, detail="請填寫姓名與電話")

    db = get_db()

    product_ref = db.collection("stores").document(store_id)\
                    .collection("products").document(product_id).get()
    if not product_ref.exists:
        raise HTTPException(status_code=404, detail="商品不存在")
    p = product_ref.to_dict()
    if not p.get("allow_waitlist"):
        raise HTTPException(status_code=400, detail="此商品不開放候補")
    if p.get("in_stock"):
        raise HTTPException(status_code=400, detail="商品尚有庫存，請直接下單")

    uid = current_user["uid"]
    existing = list(
        db.collection("waitlist")
          .where("buyer_id", "==", uid)
          .where("product_id", "==", product_id)
          .where("status", "==", "waiting")
          .limit(1)
          .stream()
    )
    if existing:
        raise HTTPException(status_code=400, detail="您已在候補名單中")

    # 每人限購檢查（含帳號歷史訂單 + 有效候補累計）
    max_per = p.get("max_per_person")
    if max_per:
        # 已下訂單數量（非取消）
        orders = db.collection("orders").where("buyer_id", "==", uid).stream()
        ordered_qty = 0
        for o in orders:
            od = o.to_dict()
            if od.get("status") == "cancelled":
                continue
            for item in od.get("items", []):
                if item.get("product_id") == product_id:
                    ordered_qty += item.get("qty", 0)
        # 有效候補數量（waiting/confirmed）
        wl_entries = db.collection("waitlist")\
                       .where("buyer_id", "==", uid)\
                       .where("product_id", "==", product_id)\
                       .stream()
        waitlist_qty = sum(
            w.to_dict().get("qty", 0) for w in wl_entries
            if w.to_dict().get("status") in ("waiting", "confirmed")
        )
        already = ordered_qty + waitlist_qty
        if already + qty > max_per:
            remaining = max(0, max_per - already)
            raise HTTPException(status_code=400,
                detail=f"此商品每人限購 {max_per} 份，您已購買或候補 {already} 份，最多還能候補 {remaining} 份")

    wid = str(uuid.uuid4())
    entry = {
        "waitlist_id": wid,
        "store_id": store_id,
        "product_id": product_id,
        "product_name": p["name"],
        "buyer_id": uid,
        "qty": qty,
        "contact_name": contact_name,
        "contact_phone": contact_phone,
        "pickup_date": pickup_date,
        "pickup_hour": pickup_hour,
        "status": "waiting",   # waiting / confirmed / cancelled / converted
        "created_at": datetime.now(timezone.utc),
    }
    db.collection("waitlist").document(wid).set(entry)
    return serialize_doc(entry)


@router.get("/my")
async def my_waitlist(current_user: dict = Depends(get_current_user)):
    """買家查看自己的候補"""
    db = get_db()
    entries = list(db.collection("waitlist")
                .where("buyer_id", "==", current_user["uid"])
                .limit(50)
                .stream())
    result = [serialize_doc(e.to_dict()) for e in entries]
    result.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return result


@router.get("/store/{store_id}")
async def store_waitlist(store_id: str, current_user: dict = Depends(get_current_user)):
    """店家查看所有候補名單（含所有狀態）"""
    db = get_db()
    store_doc = db.collection("stores").document(store_id).get()
    if not store_doc.exists or store_doc.to_dict()["owner_id"] != current_user["uid"]:
        raise HTTPException(status_code=403, detail="無權限")

    entries = list(db.collection("waitlist")
                .where("store_id", "==", store_id)
                .limit(200)
                .stream())
    result = [serialize_doc(e.to_dict()) for e in entries]
    result.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return result


@router.patch("/{waitlist_id}")
async def update_waitlist(waitlist_id: str, body: dict,
                          current_user: dict = Depends(get_current_user)):
    """買家取消；店家確認或取消"""
    db = get_db()
    ref = db.collection("waitlist").document(waitlist_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="候補記錄不存在")

    entry = doc.to_dict()
    uid = current_user["uid"]
    new_status = body.get("status")

    if entry["buyer_id"] == uid:
        if new_status != "cancelled":
            raise HTTPException(status_code=403, detail="買家只能取消候補")
    else:
        store_doc = db.collection("stores").document(entry["store_id"]).get()
        if not store_doc.exists or store_doc.to_dict()["owner_id"] != uid:
            raise HTTPException(status_code=403, detail="無權限")
        if new_status not in ("confirmed", "cancelled"):
            raise HTTPException(status_code=400, detail="無效狀態")

    ref.update({"status": new_status, "updated_at": datetime.now(timezone.utc)})
    return {"ok": True}


@router.post("/{waitlist_id}/convert")
async def convert_to_order(waitlist_id: str, current_user: dict = Depends(get_current_user)):
    """店家將候補單轉為正式訂單"""
    db = get_db()
    ref = db.collection("waitlist").document(waitlist_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="候補記錄不存在")

    entry = doc.to_dict()

    # 驗證是該店店家
    store_doc = db.collection("stores").document(entry["store_id"]).get()
    if not store_doc.exists or store_doc.to_dict()["owner_id"] != current_user["uid"]:
        raise HTTPException(status_code=403, detail="無權限")

    if entry["status"] not in ("waiting", "confirmed"):
        raise HTTPException(status_code=400, detail="此候補單已處理")

    # 建立正式訂單（以買家身份，候補轉換時跳過庫存檢查）
    order = create_order(
        db,
        buyer_id=entry["buyer_id"],
        store_id=entry["store_id"],
        items_raw=[{"product_id": entry["product_id"], "qty": entry["qty"], "selected_options": {}}],
        note="【候補單轉訂單】",
        pickup_type="takeout",
        pickup_date=entry.get("pickup_date"),
        pickup_hour=entry.get("pickup_hour"),
        contact_name=entry.get("contact_name"),
        contact_phone=entry.get("contact_phone"),
        skip_stock_check=True,
    )

    # 標記候補單為已轉換
    ref.update({"status": "converted", "order_id": order["order_id"],
                "updated_at": datetime.now(timezone.utc)})

    return serialize_doc(order)


@router.delete("/{waitlist_id}")
async def delete_waitlist(waitlist_id: str, current_user: dict = Depends(get_current_user)):
    """店家刪除已取消的候補單（需滿7天）"""
    db = get_db()
    ref = db.collection("waitlist").document(waitlist_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="候補記錄不存在")

    entry = doc.to_dict()
    store_doc = db.collection("stores").document(entry["store_id"]).get()
    if not store_doc.exists or store_doc.to_dict()["owner_id"] != current_user["uid"]:
        raise HTTPException(status_code=403, detail="無權限")

    if entry.get("status") != "cancelled":
        raise HTTPException(status_code=400, detail="只能刪除已取消的候補單")

    updated = entry.get("updated_at")
    if updated:
        if hasattr(updated, "astimezone"):
            age = (datetime.now(timezone.utc) - updated.astimezone(timezone.utc)).days
        else:
            try:
                import datetime as _dt
                t = _dt.datetime.fromisoformat(str(updated).replace("Z", "+00:00"))
                age = (datetime.now(timezone.utc) - t.astimezone(timezone.utc)).days
            except Exception:
                age = 0
        if age < 7:
            raise HTTPException(status_code=400, detail=f"取消後需滿 7 天才能刪除（還需 {7-age} 天）")

    ref.delete()
    return {"ok": True}
