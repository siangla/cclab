from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.firebase import get_db
from app.core.deps import get_current_user
from app.core.utils import serialize_doc
from app.models.order import OrderCreate, OrderStatusUpdate, OrderStatus
from app.services.order_service import create_order, update_order_status, delete_order
from app.services.user_service import get_user
from typing import Optional

router = APIRouter(prefix="/orders", tags=["orders"])

@router.post("")
async def place_order(body: OrderCreate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    order = create_order(
        db,
        buyer_id=current_user["uid"],
        store_id=body.store_id,
        items_raw=body.items,
        note=body.note,
        pickup_type=body.pickup_type,
        pickup_date=body.pickup_date,
        pickup_hour=body.pickup_hour,
        contact_name=body.contact_name,
        contact_phone=body.contact_phone,
    )
    return order

@router.get("/my")
async def my_orders(current_user: dict = Depends(get_current_user)):
    db = get_db()
    orders = db.collection("orders")\
               .where("buyer_id", "==", current_user["uid"])\
               .limit(50)\
               .stream()
    return [serialize_doc(o.to_dict()) for o in orders]

@router.get("/store/{store_id}")
async def store_orders(
    store_id: str,
    date: Optional[str] = Query(None, description="篩選日期 YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    store_doc = db.collection("stores").document(store_id).get()
    if not store_doc.exists or store_doc.to_dict()["owner_id"] != current_user["uid"]:
        raise HTTPException(status_code=403, detail="無權限")

    orders = [serialize_doc(o.to_dict()) for o in
              db.collection("orders").where("store_id", "==", store_id).limit(200).stream()]

    # 日期篩選（pickup_date 優先，否則用建立日期）
    if date:
        from datetime import timedelta, timezone as _tz
        import datetime as _dt
        TW = _tz(timedelta(hours=8))
        def match_date(o):
            if o.get("pickup_date"):
                return o["pickup_date"] == date
            created = o.get("created_at")
            if not created:
                return False
            if hasattr(created, "astimezone"):
                return created.astimezone(TW).date().isoformat() == date
            if isinstance(created, str):
                try:
                    d = _dt.datetime.fromisoformat(created.replace("Z", "+00:00"))
                    return d.astimezone(TW).date().isoformat() == date
                except Exception:
                    return created[:10] == date
            return False
        orders = [o for o in orders if match_date(o)]

    return orders

@router.get("/store/{store_id}/inventory")
async def store_inventory(
    store_id: str,
    date: Optional[str] = Query(None, description="查詢日期 YYYY-MM-DD，預設今天"),
    current_user: dict = Depends(get_current_user)
):
    """店家指定日期各品項的訂單狀態統計"""
    import datetime as dt
    db = get_db()
    store_doc = db.collection("stores").document(store_id).get()
    if not store_doc.exists or store_doc.to_dict()["owner_id"] != current_user["uid"]:
        raise HTTPException(status_code=403, detail="無權限")

    target_date = date or dt.date.today().isoformat()
    products = [p.to_dict() for p in
                db.collection("stores").document(store_id).collection("products").stream()]

    orders = [serialize_doc(o.to_dict()) for o in
              db.collection("orders").where("store_id", "==", store_id).stream()]

    # 各狀態分類
    PENDING_STATUSES  = {"pending"}
    ACCEPTED_STATUSES = {"accepted", "preparing", "ready", "cancel_requested"}
    DONE_STATUSES     = {"completed"}

    def order_date(o):
        if o.get("pickup_date"):
            return o["pickup_date"]
        created = o.get("created_at")
        if not created:
            return None
        from datetime import timedelta, timezone
        TW = timezone(timedelta(hours=8))
        if hasattr(created, "astimezone"):
            return created.astimezone(TW).date().isoformat()
        # serialize_doc 後為 ISO string，parse 後轉台灣時間
        if isinstance(created, str):
            import datetime as _dt
            try:
                d = _dt.datetime.fromisoformat(created.replace("Z", "+00:00"))
                return d.astimezone(TW).date().isoformat()
            except Exception:
                return created[:10]
        return None

    stats: dict[str, dict] = {}
    for o in orders:
        if order_date(o) != target_date:
            continue
        status = o.get("status", "")
        for item in o.get("items", []):
            pid = item["product_id"]
            if pid not in stats:
                stats[pid] = {"pending": 0, "accepted": 0, "completed": 0}
            qty = item["qty"]
            if status in PENDING_STATUSES:
                stats[pid]["pending"] += qty
            elif status in ACCEPTED_STATUSES:
                stats[pid]["accepted"] += qty
            elif status in DONE_STATUSES:
                stats[pid]["completed"] += qty

    result = []
    for p in products:
        pid = p["product_id"]
        s = stats.get(pid, {"pending": 0, "accepted": 0, "completed": 0})
        result.append({
            "product_id": pid,
            "name": p["name"],
            "price": p["price"],
            "category": p.get("category"),
            "in_stock": p.get("in_stock", True),
            "has_stock_limit": p.get("has_stock_limit", False),
            "stock_limit": p.get("stock_limit"),
            "current_stock": p.get("current_stock"),
            "pending_qty":   s["pending"],
            "accepted_qty":  s["accepted"],
            "completed_qty": s["completed"],
            "total_qty":     s["pending"] + s["accepted"] + s["completed"],
        })

    return {"date": target_date, "items": result}

@router.get("/{order_id}")
async def get_order(order_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    doc = db.collection("orders").document(order_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="訂單不存在")
    order = doc.to_dict()
    uid = current_user["uid"]
    from app.services.order_service import _get_merchant_store
    is_buyer = order["buyer_id"] == uid
    is_merchant = _get_merchant_store(db, uid) == order["store_id"]
    if not is_buyer and not is_merchant:
        raise HTTPException(status_code=403, detail="無權限")
    return order

@router.patch("/{order_id}/status")
async def change_order_status(order_id: str, body: OrderStatusUpdate,
                               current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = current_user["uid"]

    # 根據訂單關係決定角色：若使用者是該訂單的買家且執行的是買家動作，用 buyer；否則用全局角色
    order_doc = db.collection("orders").document(order_id).get()
    if not order_doc.exists:
        raise HTTPException(status_code=404, detail="訂單不存在")
    order_data = order_doc.to_dict()

    current_status = order_data.get("status", "")
    is_buyer = order_data.get("buyer_id") == uid
    # 只有下列情況視為買家動作：
    # 1. 申請取消（pending/accepted/preparing → cancel_requested）
    # 2. 直接取消待確認訂單（pending → cancelled）
    # 店家「同意取消」(cancel_requested → cancelled) 不屬於買家動作
    buyer_action = (
        is_buyer and body.status == OrderStatus.cancel_requested
    ) or (
        is_buyer and body.status == OrderStatus.cancelled
        and current_status == OrderStatus.pending.value
    )
    if buyer_action:
        role = "buyer"
    else:
        user = get_user(db, uid)
        role = user.get("role", "buyer") if user else "buyer"

    order = update_order_status(db, order_id, body.status, uid, role, body.reason)
    return order

@router.delete("/{order_id}")
async def remove_order(order_id: str, current_user: dict = Depends(get_current_user)):
    """店家刪除已取消的訂單"""
    db = get_db()
    delete_order(db, order_id, current_user["uid"])
    return {"ok": True}
