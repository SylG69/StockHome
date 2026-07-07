"""Pydantic schema definitions for StockHome API requests and responses."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr

# ==================== USERS ====================

class UserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: EmailStr
    username: str
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# ==================== CATEGORIES ====================

class CategoryBase(BaseModel):
    name: str
    icon: Optional[str] = "Package"
    color: Optional[str] = "#3B82F6"

class CategoryCreate(CategoryBase):
    pass

class CategoryResponse(CategoryBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    created_at: datetime

# ==================== SUB-CATEGORIES ====================

class SubCategoryBase(BaseModel):
    name: str
    category_id: Optional[str] = None
    min_quantity: int = 0

class SubCategoryCreate(SubCategoryBase):
    pass

class SubCategoryUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[str] = None
    min_quantity: Optional[int] = None

class SubCategoryResponse(SubCategoryBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    created_at: datetime

# ==================== STORAGE LOCATIONS ====================

class StorageLocationBase(BaseModel):
    name: str
    description: Optional[str] = ""
    icon: Optional[str] = "Home"
    color: Optional[str] = "#3B82F6"

class StorageLocationCreate(StorageLocationBase):
    pass

class StorageLocationResponse(StorageLocationBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    created_at: datetime

# ==================== PRODUCTS ====================

class ProductBase(BaseModel):
    name: str
    description: Optional[str] = ""
    barcode: Optional[str] = None
    quantity: int = 0
    min_quantity: int = 1
    unit: Optional[str] = "unité"
    category_id: Optional[str] = None
    sub_category_id: Optional[str] = None
    location_id: Optional[str] = None
    image_url: Optional[str] = None
    brand: Optional[str] = None

class ProductCreate(ProductBase):
    sub_category_name: Optional[str] = None  # création à la volée d'une sous-catégorie

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    barcode: Optional[str] = None
    quantity: Optional[int] = None
    min_quantity: Optional[int] = None
    unit: Optional[str] = None
    category_id: Optional[str] = None
    sub_category_id: Optional[str] = None
    location_id: Optional[str] = None
    image_url: Optional[str] = None
    brand: Optional[str] = None

class ProductResponse(ProductBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime
    category_name: Optional[str] = None
    location_name: Optional[str] = None
    sub_category_name: Optional[str] = None

# ==================== SHOPPING LIST ====================

class ShoppingListItemBase(BaseModel):
    product_id: Optional[str] = None
    name: str
    quantity: int = 1
    unit: Optional[str] = "unité"
    is_checked: bool = False

class ShoppingListItemCreate(ShoppingListItemBase):
    pass

class ShoppingListItemResponse(ShoppingListItemBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    created_at: datetime

# ==================== OPEN FOOD FACTS ====================

class OpenFoodFactsProduct(BaseModel):
    barcode: str
    name: Optional[str] = None
    brand: Optional[str] = None
    image_url: Optional[str] = None
    categories: Optional[str] = None
    sub_categories_suggestions: List[str] = []
    quantity_info: Optional[str] = None
    source: Optional[str] = None
