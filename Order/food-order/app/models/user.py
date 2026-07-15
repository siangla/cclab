from pydantic import BaseModel
from typing import Optional, List
from enum import Enum

class UserRole(str, Enum):
    buyer = "buyer"
    merchant = "merchant"
    admin = "admin"

class UserCreate(BaseModel):
    uid: str
    display_name: Optional[str] = None
    email: Optional[str] = None
    photo_url: Optional[str] = None
    role: UserRole = UserRole.buyer

class UserProfile(BaseModel):
    uid: str
    display_name: Optional[str] = None
    email: Optional[str] = None
    photo_url: Optional[str] = None
    role: UserRole
    phone: Optional[str] = None
    linked_providers: List[str] = []
