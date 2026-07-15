from pydantic import BaseModel
from typing import Optional, List
from enum import Enum
from datetime import datetime

class OrderStatus(str, Enum):
    pending = "pending"         # 待店家確認
    accepted = "accepted"       # 店家接受
    preparing = "preparing"     # 製作中
    ready = "ready"             # 可取餐
    completed = "completed"     # 已完成
    cancelled = "cancelled"     # 已取消
    cancel_requested = "cancel_requested"  # 買家申請取消中

class OrderItem(BaseModel):
    product_id: str
    product_name: str
    qty: int
    unit_price: float
    selected_options: dict = {}  # e.g. {"辣度": "小辣"}
    subtotal: float

class OrderCreate(BaseModel):
    store_id: str
    items: List[dict]   # [{product_id, qty, selected_options}]
    note: Optional[str] = None
    pickup_type: str = "takeout"  # takeout / dine_in
    pickup_date: Optional[str] = None   # "YYYY-MM-DD"
    pickup_hour: Optional[int] = None   # 9–18
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None

class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    reason: Optional[str] = None   # 拒絕時填原因

class OrderOut(BaseModel):
    order_id: str
    buyer_id: str
    store_id: str
    items: List[OrderItem]
    status: OrderStatus
    total_amount: float
    note: Optional[str] = None
    pickup_type: str
    pickup_date: Optional[str] = None
    pickup_hour: Optional[int] = None
    reject_reason: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
