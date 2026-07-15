from firebase_admin import firestore
from app.models.order import OrderStatus
from datetime import datetime, timezone, date
from fastapi import HTTPException

def _get_buyer_ordered_qty(db, buyer_id: str, product_id: str) -> int:
    """查詢該帳號對某商品的有效訂單累計數量（排除已取消）"""
    CANCELLED = {OrderStatus.cancelled.value}
    orders = db.collection("orders")\
               .where("buyer_id", "==", buyer_id)\
               .where("status", "not-in", list(CANCELLED))\
               .stream()
    total = 0
    for o in orders:
        for item in o.to_dict().get("items", []):
            if item.get("product_id") == product_id:
                total += item.get("qty", 0)
    return total


def calculate_order_total(db, store_id: str, items: list,
                          skip_stock_check: bool = False,
                          buyer_id: str = None) -> tuple[list, float]:
    """後端重新計算訂單金額，並驗證商品可購買狀態"""
    computed_items = []
    total = 0.0
    today = date.today().isoformat()

    for item in items:
        product_id = item["product_id"]
        qty = int(item.get("qty", 1))
        selected_options = item.get("selected_options", {})

        product_ref = db.collection("stores").document(store_id)\
                        .collection("products").document(product_id).get()
        if not product_ref.exists:
            raise HTTPException(status_code=400, detail=f"商品 {product_id} 不存在")
        p = product_ref.to_dict()

        if not skip_stock_check and not p.get("in_stock", True):
            raise HTTPException(status_code=400, detail=f"商品「{p['name']}」已售完")

        # 販售區間檢查
        sale_start = p.get("sale_start")
        sale_end = p.get("sale_end")
        if sale_start and today < sale_start:
            raise HTTPException(status_code=400, detail=f"商品「{p['name']}」尚未開始販售")
        if sale_end and today > sale_end:
            raise HTTPException(status_code=400, detail=f"商品「{p['name']}」已結束販售")

        # 每人限購檢查（含帳號歷史訂單）
        max_per = p.get("max_per_person")
        if max_per:
            already = _get_buyer_ordered_qty(db, buyer_id, product_id) if buyer_id else 0
            if already + qty > max_per:
                remaining = max(0, max_per - already)
                raise HTTPException(status_code=400,
                    detail=f"商品「{p['name']}」每人限購 {max_per} 份，您已購買 {already} 份，最多還能購買 {remaining} 份")

        # 庫存數量檢查
        if p.get("has_stock_limit"):
            current_stock = p.get("current_stock", 0)
            if current_stock is not None and current_stock < qty:
                raise HTTPException(status_code=400,
                    detail=f"商品「{p['name']}」剩餘數量不足（剩 {current_stock}）")

        unit_price = p["price"]
        for opt in p.get("options", []):
            chosen = selected_options.get(opt["name"])
            if chosen and opt.get("extra_price", 0) > 0:
                unit_price += opt["extra_price"]

        subtotal = unit_price * qty
        total += subtotal
        computed_items.append({
            "product_id": product_id,
            "product_name": p["name"],
            "qty": qty,
            "unit_price": unit_price,
            "selected_options": selected_options,
            "subtotal": subtotal,
        })

    return computed_items, total

def decrement_stock(db, store_id: str, items: list):
    """訂單成立後扣減庫存"""
    for item in items:
        product_id = item["product_id"]
        qty = item["qty"]
        ref = db.collection("stores").document(store_id)\
                .collection("products").document(product_id)
        p = ref.get().to_dict()
        if not p or not p.get("has_stock_limit"):
            continue
        new_stock = max(0, (p.get("current_stock") or 0) - qty)
        update = {"current_stock": new_stock}
        if new_stock == 0:
            update["in_stock"] = False
        ref.update(update)

def create_order(db, buyer_id: str, store_id: str, items_raw: list,
                 note: str, pickup_type: str,
                 pickup_date: str = None, pickup_hour: int = None,
                 contact_name: str = None, contact_phone: str = None,
                 skip_stock_check: bool = False) -> dict:
    store_doc = db.collection("stores").document(store_id).get()
    if not store_doc.exists:
        raise HTTPException(status_code=404, detail="店家不存在")
    if not store_doc.to_dict().get("is_open", True):
        raise HTTPException(status_code=400, detail="店家暫停接單中")

    computed_items, total = calculate_order_total(db, store_id, items_raw,
                                                  skip_stock_check=skip_stock_check,
                                                  buyer_id=buyer_id)

    now = datetime.now(timezone.utc)
    order_ref = db.collection("orders").document()
    order_data = {
        "order_id": order_ref.id,
        "buyer_id": buyer_id,
        "store_id": store_id,
        "items": computed_items,
        "status": OrderStatus.pending.value,
        "total_amount": total,
        "note": note,
        "pickup_type": pickup_type,
        "pickup_date": pickup_date,
        "pickup_hour": pickup_hour,
        "contact_name": contact_name,
        "contact_phone": contact_phone,
        "reject_reason": None,
        "created_at": now,
        "updated_at": now,
    }
    order_ref.set(order_data)
    decrement_stock(db, store_id, computed_items)
    return order_data

def update_order_status(db, order_id: str, new_status: OrderStatus,
                        actor_uid: str, actor_role: str, reason: str = None) -> dict:
    ref = db.collection("orders").document(order_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="訂單不存在")

    order = doc.to_dict()
    current = OrderStatus(order["status"])

    allowed = {
        (OrderStatus.pending, "merchant"): [OrderStatus.accepted, OrderStatus.cancelled],
        (OrderStatus.accepted, "merchant"): [OrderStatus.preparing, OrderStatus.cancelled],
        (OrderStatus.preparing, "merchant"): [OrderStatus.ready],
        (OrderStatus.ready, "merchant"): [OrderStatus.completed],
        (OrderStatus.cancel_requested, "merchant"): [OrderStatus.cancelled, OrderStatus.accepted],
        (OrderStatus.pending, "buyer"): [OrderStatus.cancelled],
        (OrderStatus.accepted, "buyer"): [OrderStatus.cancel_requested],
        (OrderStatus.preparing, "buyer"): [OrderStatus.cancel_requested],
    }

    allowed_next = allowed.get((current, actor_role), [])
    if new_status not in allowed_next:
        raise HTTPException(status_code=400,
            detail=f"當前狀態 {current.value} 不允許轉換為 {new_status.value}")

    if actor_role == "merchant" and order["store_id"] != _get_merchant_store(db, actor_uid):
        raise HTTPException(status_code=403, detail="無權操作此訂單")
    if actor_role == "buyer" and order["buyer_id"] != actor_uid:
        raise HTTPException(status_code=403, detail="無權操作此訂單")

    update_data = {
        "status": new_status.value,
        "updated_at": datetime.now(timezone.utc),
    }
    if reason:
        update_data["reject_reason"] = reason

    ref.update(update_data)

    # 訂單取消時補回庫存
    if new_status == OrderStatus.cancelled:
        _restore_stock(db, order["store_id"], order.get("items", []))

    return {**order, **update_data}

def delete_order(db, order_id: str, actor_uid: str) -> None:
    """店家刪除已取消的訂單（需滿7天）"""
    ref = db.collection("orders").document(order_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="訂單不存在")
    order = doc.to_dict()
    if order["status"] != OrderStatus.cancelled.value:
        raise HTTPException(status_code=400, detail="只能刪除已取消的訂單")
    if order["store_id"] != _get_merchant_store(db, actor_uid):
        raise HTTPException(status_code=403, detail="無權操作此訂單")
    updated = order.get("updated_at")
    if updated:
        if hasattr(updated, "astimezone"):
            age_days = (datetime.now(timezone.utc) - updated.astimezone(timezone.utc)).days
        else:
            try:
                t = datetime.fromisoformat(str(updated).replace("Z", "+00:00"))
                age_days = (datetime.now(timezone.utc) - t.astimezone(timezone.utc)).days
            except Exception:
                age_days = 0
        if age_days < 7:
            raise HTTPException(status_code=400,
                detail=f"取消後需滿 7 天才能刪除（還需 {7 - age_days} 天）")
    ref.delete()

def _restore_stock(db, store_id: str, items: list):
    """取消訂單後補回庫存，並若商品開放候補則重新上架並確認候補名單"""
    for item in items:
        product_id = item["product_id"]
        ref = db.collection("stores").document(store_id)\
                .collection("products").document(product_id)
        p = ref.get()
        if not p.exists:
            continue
        p_data = p.to_dict()
        if not p_data.get("has_stock_limit"):
            continue
        restored_qty = item["qty"]
        new_stock = (p_data.get("current_stock") or 0) + restored_qty
        update = {"current_stock": new_stock}
        if not p_data.get("in_stock") and new_stock > 0:
            update["in_stock"] = True
        ref.update(update)

        # 若商品開放候補，依序確認候補名單（先進先出）
        if p_data.get("allow_waitlist"):
            waiting = list(
                db.collection("waitlist")
                  .where("product_id", "==", product_id)
                  .where("status", "==", "waiting")
                  .limit(10)
                  .stream()
            )
            # 依建立時間排序（Firestore 不一定保序，手動排）
            waiting.sort(key=lambda d: d.to_dict().get("created_at") or "")
            remaining = restored_qty
            for w_doc in waiting:
                if remaining <= 0:
                    break
                w = w_doc.to_dict()
                need = w.get("qty", 1)
                if need <= remaining:
                    db.collection("waitlist").document(w_doc.id).update({
                        "status": "confirmed",
                        "updated_at": datetime.now(timezone.utc),
                    })
                    remaining -= need


def _get_merchant_store(db, uid: str) -> str | None:
    stores = db.collection("stores").where("owner_id", "==", uid).limit(1).stream()
    for s in stores:
        return s.id
    return None
