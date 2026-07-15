from pydantic import BaseModel, Field
from typing import Optional, List

class ProductOption(BaseModel):
    name: str
    choices: List[str]
    extra_price: float = 0.0
    required: bool = False

class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: float = Field(..., gt=0)
    category: Optional[str] = None
    in_stock: bool = True
    is_active: bool = True
    options: List[ProductOption] = []
    # 數量限制
    has_stock_limit: bool = False
    stock_limit: Optional[int] = None      # 每日上限數量
    current_stock: Optional[int] = None    # 目前剩餘數量
    allow_waitlist: bool = False           # 售完後是否開放候補
    # 販售區間（上架/下架日期）
    sale_start: Optional[str] = None       # "YYYY-MM-DD"
    sale_end: Optional[str] = None
    # 取貨區間
    pickup_start: Optional[str] = None     # "YYYY-MM-DD"
    pickup_end: Optional[str] = None
    pickup_hours_start: int = 9            # 取貨開始時段（24h）
    pickup_hours_end: int = 18             # 取貨結束時段
    max_per_person: Optional[int] = None  # 每人限購數量

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = Field(None, gt=0)
    category: Optional[str] = None
    in_stock: Optional[bool] = None
    options: Optional[List[ProductOption]] = None
    image_url: Optional[str] = None
    has_stock_limit: Optional[bool] = None
    stock_limit: Optional[int] = None
    current_stock: Optional[int] = None
    allow_waitlist: Optional[bool] = None
    is_active: Optional[bool] = None
    sale_start: Optional[str] = None
    sale_end: Optional[str] = None
    pickup_start: Optional[str] = None
    pickup_end: Optional[str] = None
    pickup_hours_start: Optional[int] = None
    pickup_hours_end: Optional[int] = None
    max_per_person: Optional[int] = None

class ProductOut(BaseModel):
    product_id: str
    store_id: str
    name: str
    description: Optional[str] = None
    price: float
    category: Optional[str] = None
    image_url: Optional[str] = None
    in_stock: bool
    options: List[ProductOption] = []
    has_stock_limit: bool = False
    stock_limit: Optional[int] = None
    current_stock: Optional[int] = None
    allow_waitlist: bool = False
    is_active: bool = True
    sale_start: Optional[str] = None
    sale_end: Optional[str] = None
    pickup_start: Optional[str] = None
    pickup_end: Optional[str] = None
    pickup_hours_start: int = 9
    pickup_hours_end: int = 18
    max_per_person: Optional[int] = None
