from pydantic import BaseModel
from typing import Optional

class StoreCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None

class StoreUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    is_open: Optional[bool] = None
    logo_url: Optional[str] = None

class StoreOut(BaseModel):
    store_id: str
    owner_id: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    logo_url: Optional[str] = None
    is_open: bool = True
