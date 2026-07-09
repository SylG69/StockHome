"""Définitions des schémas Pydantic pour les requêtes et réponses de l'API StockHome."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr

# ==================== USERS ====================

class UserRegister(BaseModel):
    """Données pour l'inscription d'un utilisateur."""
    email: EmailStr
    username: str
    password: str

class UserLogin(BaseModel):
    """Données pour la connexion d'un utilisateur (email + mot de passe)."""
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    """Représentation publique d'un utilisateur renvoyée par l'API."""
    id: str
    email: EmailStr
    username: str
    created_at: datetime

class TokenResponse(BaseModel):
    """Payload contenant le jeton d'accès et l'utilisateur associé."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# ==================== CATEGORIES ====================

class CategoryBase(BaseModel):
    """Base décrivant une catégorie (nom, icône, couleur)."""
    name: str
    icon: Optional[str] = "Package"
    color: Optional[str] = "#3B82F6"

class CategoryCreate(CategoryBase):
    """Requête de création d'une catégorie."""
    pass

class CategoryResponse(CategoryBase):
    model_config = ConfigDict(from_attributes=True)
    """Réponse API pour une catégorie, inclut métadonnées et propriétaire."""
    id: str
    user_id: str
    created_at: datetime

# ==================== SUB-CATEGORIES ====================

class SubCategoryBase(BaseModel):
    """Base décrivant une sous-catégorie et son seuil minimal."""
    name: str
    category_id: Optional[str] = None
    min_quantity: int = 0

class SubCategoryCreate(SubCategoryBase):
    """Requête de création d'une sous-catégorie."""
    pass

class SubCategoryUpdate(BaseModel):
    """Modèle de mise à jour partielle d'une sous-catégorie."""
    name: Optional[str] = None
    category_id: Optional[str] = None
    min_quantity: Optional[int] = None

class SubCategoryResponse(SubCategoryBase):
    model_config = ConfigDict(from_attributes=True)
    """Réponse API pour une sous-catégorie, inclut métadonnées et propriétaire."""
    id: str
    user_id: str
    created_at: datetime

# ==================== STORAGE LOCATIONS ====================

class StorageLocationBase(BaseModel):
    """Base décrivant un emplacement de stockage (nom, description, icône)."""
    name: str
    description: Optional[str] = ""
    icon: Optional[str] = "Home"
    color: Optional[str] = "#3B82F6"

class StorageLocationCreate(StorageLocationBase):
    """Requête de création d'un emplacement de stockage."""
    pass

class StorageLocationResponse(StorageLocationBase):
    model_config = ConfigDict(from_attributes=True)
    """Réponse API pour un emplacement de stockage avec métadonnées."""
    id: str
    user_id: str
    created_at: datetime

# ==================== PRODUCTS ====================

class ProductBase(BaseModel):
    """Base décrivant les champs communs d'un produit."""
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
    """Requête de création d'un produit; peut contenir un nom de sous-catégorie."""
    sub_category_name: Optional[str] = None  # création à la volée d'une sous-catégorie

class ProductUpdate(BaseModel):
    """Modèle de mise à jour partielle d'un produit (champs optionnels)."""
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
    """Réponse API pour un produit, inclut métadonnées et noms résolus."""
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime
    category_name: Optional[str] = None
    location_name: Optional[str] = None
    sub_category_name: Optional[str] = None

# ==================== SHOPPING LIST ====================

class ShoppingListItemBase(BaseModel):
    """Base décrivant un item de liste de courses."""
    product_id: Optional[str] = None
    name: str
    quantity: int = 1
    unit: Optional[str] = "unité"
    is_checked: bool = False

class ShoppingListItemCreate(ShoppingListItemBase):
    """Requête pour ajouter un item à la liste de courses."""
    pass

class ShoppingListItemResponse(ShoppingListItemBase):
    model_config = ConfigDict(from_attributes=True)
    """Réponse API pour un item de liste de courses, avec métadonnées."""
    id: str
    user_id: str
    created_at: datetime

# ==================== OPEN FOOD FACTS ====================

class OpenFoodFactsProduct(BaseModel):
    """Modèle de suggestion produit basé sur les réponses Open*Facts."""
    barcode: str
    name: Optional[str] = None
    brand: Optional[str] = None
    image_url: Optional[str] = None
    categories: Optional[str] = None
    sub_categories_suggestions: List[str] = []
    quantity_info: Optional[str] = None
    source: Optional[str] = None
