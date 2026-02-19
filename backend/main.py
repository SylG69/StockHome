from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import httpx
from jose import JWTError, jwt
from contextlib import asynccontextmanager

ROOT_DIR = Path(__file__).parent
# désactivation du chargement avec le .env
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Chargement des variables d'environnement
load_dotenv()

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'stockhome-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

security = HTTPBearer()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
# --- Gestion de la connexion MongoDB (Optimisé pour la prod) ---
class Database:
    client: AsyncIOMotorClient = None
    db = None

db_connection = Database()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Au démarrage
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME', 'stockhome')
    db_connection.client = AsyncIOMotorClient(mongo_url)
    db_connection.db = db_connection.client[db_name]
    yield
    # À la fermeture
    db_connection.client.close()

# Initialisation de l'app avec lifespan
app = FastAPI(title="StockHome API", version="1.0.0", lifespan=lifespan)
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Logique de raccourci pour accéder à la DB dans les routes
def get_db():
    return db_connection.db

# ==================== MODELS ====================

# User Models
class UserBase(BaseModel):
    email: EmailStr
    name: str

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(UserBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserResponse(UserBase):
    id: str
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# Category Models
class CategoryBase(BaseModel):
    name: str
    icon: Optional[str] = "Package"
    color: Optional[str] = "#3B82F6"

class CategoryCreate(CategoryBase):
    pass

class Category(CategoryBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CategoryResponse(CategoryBase):
    id: str
    user_id: str
    created_at: str

# SUb-Categories Models
class SubCategoryBase(BaseModel):
    name: str
    min_quantity: int = 0

class SubCategoryCreate(SubCategoryBase):
    pass

class SubCategory(SubCategoryBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SubCategoryResponse(SubCategoryBase):
    id: str
    user_id: str
    created_at: str

# Storage Location Models
class StorageLocationBase(BaseModel):
    name: str
    description: Optional[str] = ""
    icon: Optional[str] = "Home"

class StorageLocationCreate(StorageLocationBase):
    pass

class StorageLocation(StorageLocationBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StorageLocationResponse(StorageLocationBase):
    id: str
    user_id: str
    created_at: str

# Product Models
class ProductBase(BaseModel):
    name: str
    description: Optional[str] = ""
    barcode: Optional[str] = None
    quantity: int = 0
    min_quantity: int = 1
    unit: Optional[str] = "unité"
    category_id: Optional[str] = None
    sub_category_id: Optional[str] = None
    sub_category_name: Optional[str] = None
    location_id: Optional[str] = None
    image_url: Optional[str] = None
    brand: Optional[str] = None

class ProductCreate(ProductBase):
    sub_category_name: Optional[str] = None
    pass

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

class Product(ProductBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductResponse(ProductBase):
    id: str
    user_id: str
    created_at: str
    updated_at: str
    category_name: Optional[str] = None
    location_name: Optional[str] = None

# Shopping List Models
class ShoppingListItemBase(BaseModel):
    product_id: Optional[str] = None
    name: str
    quantity: int = 1
    unit: Optional[str] = "unité"
    is_checked: bool = False

class ShoppingListItemCreate(ShoppingListItemBase):
    pass

class ShoppingListItem(ShoppingListItemBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ShoppingListItemResponse(ShoppingListItemBase):
    id: str
    user_id: str
    created_at: str

class OpenFoodFactsProduct(BaseModel):
    """
    Open Food Facts Response
    """
    barcode: str
    name: Optional[str] = None
    brand: Optional[str] = None
    image_url: Optional[str] = None
    categories: Optional[str] = None
    # sub_categories: Optional[str] = None
    sub_categories_suggestions: List[str] = []
    quantity_info: Optional[str] = None

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    """ Fonction de hash du password """
    # bcrypt nécessite des bytes
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    """ Fonction de vérification du password """
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode = {"sub": str(user_id), "exp": expire}
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = await db_connection.db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if email already exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")

    # Create user
    user = User(
        email=user_data.email,
        name=user_data.name
    )
    user_dict = user.model_dump()
    user_dict['password'] = hash_password(user_data.password)
    user_dict['created_at'] = user_dict['created_at'].isoformat()

    await db.users.insert_one(user_dict)

    # Create default categories
    default_categories = [
        {"name": "Alimentaire", "icon": "Apple", "color": "#10B981"},
        {"name": "Boissons", "icon": "Wine", "color": "#3B82F6"},
        {"name": "Hygiène", "icon": "Sparkles", "color": "#8B5CF6"},
        {"name": "Entretien", "icon": "SprayCan", "color": "#F59E0B"},
        {"name": "Animaux", "icon": "PawPrint", "color": "#EF4444"},
        {"name": "Autre", "icon": "Package", "color": "#6B7280"},
    ]
    for cat_data in default_categories:
        cat = Category(**cat_data, user_id=user.id)
        cat_dict = cat.model_dump()
        cat_dict['created_at'] = cat_dict['created_at'].isoformat()
        await db.categories.insert_one(cat_dict)

    # Create default storage locations
    default_locations = [
        {"name": "Cuisine", "description": "Placards et étagères de cuisine", "icon": "ChefHat"},
        {"name": "Réfrigérateur", "description": "Produits frais", "icon": "Snowflake"},
        {"name": "Salle de bain", "description": "Produits d'hygiène", "icon": "Bath"},
        {"name": "Garage", "description": "Stockage garage", "icon": "Warehouse"},
    ]
    for loc_data in default_locations:
        loc = StorageLocation(**loc_data, user_id=user.id)
        loc_dict = loc.model_dump()
        loc_dict['created_at'] = loc_dict['created_at'].isoformat()
        await db.storage_locations.insert_one(loc_dict)

    token = create_token(user.id)
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            created_at=user_dict['created_at']
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user['password']):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    token = create_token(user['id'])
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user['id'],
            email=user['email'],
            name=user['name'],
            created_at=user['created_at']
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user['id'],
        email=current_user['email'],
        name=current_user['name'],
        created_at=current_user['created_at']
    )

# ==================== CATEGORIES ROUTES ====================

@api_router.get("/categories", response_model=List[CategoryResponse])
async def get_categories(current_user: dict = Depends(get_current_user)):
    categories = await db.categories.find(
        {"user_id": current_user['id']},
        {"_id": 0}
    ).to_list(100)
    return categories

@api_router.post("/categories", response_model=CategoryResponse)
async def create_category(category_data: CategoryCreate, current_user: dict = Depends(get_current_user)):
    category = Category(**category_data.model_dump(), user_id=current_user['id'])
    cat_dict = category.model_dump()
    cat_dict['created_at'] = cat_dict['created_at'].isoformat()
    await db.categories.insert_one(cat_dict)
    return cat_dict

@api_router.put("/categories/{category_id}", response_model=CategoryResponse)
async def update_category(category_id: str, category_data: CategoryCreate, current_user: dict = Depends(get_current_user)):
    result = await db.categories.find_one_and_update(
        {"id": category_id, "user_id": current_user['id']},
        {"$set": category_data.model_dump()},
        return_document=True,
        projection={"_id": 0}
    )
    if not result:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée")
    return result

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.categories.delete_one({"id": category_id, "user_id": current_user['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée")
    # Set products with this category to null
    await db.products.update_many(
        {"category_id": category_id, "user_id": current_user['id']},
        {"$set": {"category_id": None}}
    )
    return {"message": "Catégorie supprimée"}

# ==================== SUB CATEGORIES ROUTES ====================

@api_router.get("/subcategories", response_model=List[SubCategoryResponse])
async def get_subcategories(current_user: dict = Depends(get_current_user)):
    sub_categories = await db.sub_categories.find(
        {"user_id": current_user['id']},
        {"_id": 0}
    ).to_list(100)
    return sub_categories

@api_router.post("/subcategories", response_model=SubCategoryResponse)
async def create_subcategory(sub_category_data: SubCategoryCreate, current_user: dict = Depends(get_current_user)):
    sub_category = SubCategory(**sub_category_data.model_dump(), user_id=current_user['id'])
    sub_cat_dict = sub_category.model_dump()
    sub_cat_dict['created_at'] = sub_cat_dict['created_at'].isoformat()
    await db.sub_categories.insert_one(sub_cat_dict)
    return sub_cat_dict

@api_router.put("/subcategories/{sub_category_id}", response_model=SubCategoryResponse)
async def update_subcategory(sub_category_id: str, sub_category_data: SubCategoryCreate, current_user: dict = Depends(get_current_user)):
    result = await db.sub_categories.find_one_and_update(
        {"id": sub_category_id, "user_id": current_user['id']},
        {"$set": sub_category_data.model_dump()},
        return_document=True,
        projection={"_id": 0}
    )
    if not result:
        raise HTTPException(status_code=404, detail="Sous-Catégorie non trouvée")
    return result

@api_router.delete("/subcategories/{sub_category_id}")
async def delete_subcategory(sub_category_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.sub_categories.delete_one({"id": sub_category_id, "user_id": current_user['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sous-Catégorie non trouvée")
    # Set products with this category to null
    await db.products.update_many(
        {"sub_category_id": sub_category_id, "user_id": current_user['id']},
        {"$set": {"sub_category_id": None}}
    )
    return {"message": "Sous-Catégorie supprimée"}

# ==================== STORAGE LOCATIONS ROUTES ====================

@api_router.get("/locations", response_model=List[StorageLocationResponse])
async def get_locations(current_user: dict = Depends(get_current_user)):
    """
    Recherche un emplacement
    """
    locations = await db.storage_locations.find(
        {"user_id": current_user['id']},
        {"_id": 0}
    ).to_list(100)
    return locations

@api_router.post("/locations", response_model=StorageLocationResponse)
async def create_location(location_data: StorageLocationCreate, current_user: dict = Depends(get_current_user)):
    """
    Création d'un emplacement
    """
    location = StorageLocation(**location_data.model_dump(), user_id=current_user['id'])
    loc_dict = location.model_dump()
    loc_dict['created_at'] = loc_dict['created_at'].isoformat()
    await db.storage_locations.insert_one(loc_dict)
    return loc_dict

@api_router.put("/locations/{location_id}", response_model=StorageLocationResponse)
async def update_location(location_id: str, location_data: StorageLocationCreate, current_user: dict = Depends(get_current_user)):
    """
    Mise à jour d'un emplacement
    """
    result = await db.storage_locations.find_one_and_update(
        {"id": location_id, "user_id": current_user['id']},
        {"$set": location_data.model_dump()},
        return_document=True,
        projection={"_id": 0}
    )
    if not result:
        raise HTTPException(status_code=404, detail="Emplacement non trouvé")
    return result

@api_router.delete("/locations/{location_id}")
async def delete_location(location_id: str, current_user: dict = Depends(get_current_user)):
    """
    Suppression d'un emplacement
    """
    result = await db.storage_locations.delete_one({"id": location_id, "user_id": current_user['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Emplacement non trouvé")
    # Set products with this location to null
    await db.products.update_many(
        {"location_id": location_id, "user_id": current_user['id']},
        {"$set": {"location_id": None}}
    )
    return {"message": "Emplacement supprimé"}

# ==================== PRODUCTS ROUTES ====================

@api_router.get("/products", response_model=List[ProductResponse])
async def get_products(
    category_id: Optional[str] = None,
    location_id: Optional[str] = None,
    low_stock: Optional[bool] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user['id']}

    if category_id:
        query["category_id"] = category_id
    if location_id:
        query["location_id"] = location_id
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"barcode": {"$regex": search, "$options": "i"}},
            {"brand": {"$regex": search, "$options": "i"}}
        ]

    products = await db.products.find(query, {"_id": 0}).to_list(1000)

    # Get categories and locations for enrichment
    categories = {c['id']: c['name'] for c in await db.categories.find({"user_id": current_user['id']}, {"_id": 0}).to_list(100)}
    locations = {l['id']: l['name'] for l in await db.storage_locations.find({"user_id": current_user['id']}, {"_id": 0}).to_list(100)}

    result = []
    for p in products:
        if low_stock and p['quantity'] >= p['min_quantity']:
            continue
        p['category_name'] = categories.get(p.get('category_id'))
        p['location_name'] = locations.get(p.get('location_id'))
        result.append(p)

    return result

@api_router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str, current_user: dict = Depends(get_current_user)):
    product = await db.products.find_one(
        {"id": product_id, "user_id": current_user['id']},
        {"_id": 0}
    )
    if not product:
        raise HTTPException(status_code=404, detail="Produit non trouvé")

    # Enrich with category and location names
    if product.get('category_id'):
        cat = await db.categories.find_one({"id": product['category_id']}, {"_id": 0})
        product['category_name'] = cat['name'] if cat else None
    if product.get('location_id'):
        loc = await db.storage_locations.find_one({"id": product['location_id']}, {"_id": 0})
        product['location_name'] = loc['name'] if loc else None

    return product

@api_router.post("/products", response_model=ProductResponse)
async def create_product(product_data: ProductCreate, current_user: dict = Depends(get_current_user)):
    user_id = current_user['id']
    data_dict = product_data.model_dump()

    # 1. Extraction des informations de sous-catégorie
    # On retire sub_category_name du dictionnaire pour ne pas polluer l'objet Product final
    sub_category_name = data_dict.pop('sub_category_name', None)
    if sub_category_name:
        sub_category_name = sub_category_name.strip().capitalize()

    sub_category_id = data_dict.get('sub_category_id')

    # 2. LOGIQUE DE GESTION AUTOMATIQUE/MANUELLE DES SOUS-CATÉGORIES
    # Si on a un nom mais pas encore d'ID (saisie manuelle ou suggestion OFF)
    if sub_category_name and not sub_category_id:
        # Recherche insensible à la casse (case-insensitive) pour éviter les doublons
        # On cherche si cette sous-catégorie existe déjà pour cet utilisateur spécifique
        existing_sub = await db.sub_categories.find_one({
            "user_id": user_id,
            "name": {"$regex": f"^{sub_category_name}$", "$options": "i"}
        })

        if existing_sub:
            sub_category_id = existing_sub['id']
        else:
            # Si elle n'existe pas, on crée une nouvelle instance de SubCategory
            new_sub = SubCategory(
                name=sub_category_name,
                user_id=user_id,
                category_id=data_dict.get('category_id') # Optionnel: lie au parent si présent
            )
            sub_dict = new_sub.model_dump()

            # Conversion de la date pour MongoDB
            if isinstance(sub_dict.get('created_at'), datetime):
                sub_dict['created_at'] = sub_dict['created_at'].isoformat()

            await db.sub_categories.insert_one(sub_dict)
            sub_category_id = new_sub.id

        # On met à jour l'ID final dans les données du produit
        data_dict['sub_category_id'] = sub_category_id

    # 3. CRÉATION DU PRODUIT FINAL
    product = Product(**data_dict, user_id=user_id)
    prod_dict = product.model_dump()

    # Préparation des dates pour le stockage
    for date_field in ['created_at', 'updated_at']:
        if isinstance(prod_dict.get(date_field), datetime):
            prod_dict[date_field] = prod_dict[date_field].isoformat()

    await db.products.insert_one(prod_dict)

    # 4. ENRICHISSEMENT DE LA RÉPONSE POUR LE FRONTEND
    # (Permet d'afficher les noms plutôt que juste les IDs après l'ajout)
    prod_dict['category_name'] = None
    prod_dict['location_name'] = None
    prod_dict['sub_category_name'] = sub_category_name # On renvoie le nom utilisé

    if prod_dict.get('category_id'):
        cat = await db.categories.find_one({"id": prod_dict['category_id']}, {"_id": 0})
        if cat:
            prod_dict['category_name'] = cat['name']

    if prod_dict.get('location_id'):
        loc = await db.storage_locations.find_one({"id": prod_dict['location_id']}, {"_id": 0})
        if loc:
            prod_dict['location_name'] = loc['name']

    return prod_dict

@api_router.put("/products/{product_id}", response_model=ProductResponse)
async def update_product(product_id: str, product_data: ProductUpdate, current_user: dict = Depends(get_current_user)):
    update_data = {k: v for k, v in product_data.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()

    result = await db.products.find_one_and_update(
        {"id": product_id, "user_id": current_user['id']},
        {"$set": update_data},
        return_document=True,
        projection={"_id": 0}
    )
    if not result:
        raise HTTPException(status_code=404, detail="Produit non trouvé")

    # Enrich response
    result['category_name'] = None
    result['location_name'] = None
    if result.get('category_id'):
        cat = await db.categories.find_one({"id": result['category_id']}, {"_id": 0})
        result['category_name'] = cat['name'] if cat else None
    if result.get('location_id'):
        loc = await db.storage_locations.find_one({"id": result['location_id']}, {"_id": 0})
        result['location_name'] = loc['name'] if loc else None

    return result

@api_router.patch("/products/{product_id}/quantity")
async def update_product_quantity(product_id: str, delta: int, current_user: dict = Depends(get_current_user)):
    """Increment or decrement product quantity"""
    product = await db.products.find_one({"id": product_id, "user_id": current_user['id']}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Produit non trouvé")

    new_quantity = max(0, product['quantity'] + delta)
    await db.products.update_one(
        {"id": product_id},
        {"$set": {"quantity": new_quantity, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"quantity": new_quantity}

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.products.delete_one({"id": product_id, "user_id": current_user['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Produit non trouvé")
    return {"message": "Produit supprimé"}

# ==================== BARCODE / OPEN FOOD FACTS ====================

@api_router.get("/barcode/{barcode}", response_model=OpenFoodFactsProduct)
async def lookup_barcode(barcode: str):
    """Look up product info from Open Food Facts"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"https://world.openfoodfacts.org/api/v0/product/{barcode}.json",
                timeout=10.0
            )
            data = response.json()

            if data.get('status') != 1:
                raise HTTPException(status_code=404, detail="Produit non trouvé dans Open Food Facts")

            product = data.get('product', {})
            # 1. On récupère la chaîne brute (ex: "Produits laitiers, Matières grasses")
            categories_str = product.get('categories_old', '')

            def clean_categories(categories_str):
                if not categories_str or not isinstance(categories_str, str):
                    return []
                raw_tags = categories_str.split(',')
                cleaned_list = []
                for t in raw_tags:
                    clean = t.strip().split(':')[-1].replace('-', ' ').capitalize()
                    if clean:
                        cleaned_list.append(clean)

                return cleaned_list

            suggestions = clean_categories(categories_str)
            main_cat = suggestions[min(len(suggestions)-1, 2)] if suggestions else None
            return OpenFoodFactsProduct(
                barcode=barcode,
                name=product.get('product_name') or product.get('product_name_fr'),
                brand=product.get('brands'),
                image_url=product.get('image_url') or product.get('image_front_url'),
                categories=product.get('categories'),
                sub_categories_suggestions=suggestions,
                quantity_info=product.get('quantity')
            )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Timeout lors de la requête Open Food Facts")
        except Exception as e:
            logger.error(f"Error fetching barcode {barcode}: {e}")
            raise HTTPException(status_code=500, detail="Erreur lors de la recherche du produit")

@api_router.get("/products/barcode/{barcode}")
async def get_product_by_barcode(barcode: str, current_user: dict = Depends(get_current_user)):
    """Get existing product by barcode"""
    product = await db.products.find_one(
        {"barcode": barcode, "user_id": current_user['id']},
        {"_id": 0}
    )
    if not product:
        raise HTTPException(status_code=404, detail="Produit non trouvé")
    return product

# ==================== SHOPPING LIST ROUTES ====================

@api_router.get("/shopping-list", response_model=List[ShoppingListItemResponse])
async def get_shopping_list(current_user: dict = Depends(get_current_user)):
    items = await db.shopping_list.find(
        {"user_id": current_user['id']},
        {"_id": 0}
    ).to_list(500)
    return items

@api_router.get("/shopping-list/generate", response_model=List[ShoppingListItemResponse])
async def generate_shopping_list(current_user: dict = Depends(get_current_user)):
    """Version optimisée avec insertion groupée"""
    # 1. Récupération des produits en stock bas
    all_products = await db.products.find({"user_id": current_user['id']}, {"_id": 0}).to_list(1000)
    low_stock_products = [p for p in all_products if p['quantity'] < p.get('min_quantity', 0)]

    # 2. Nettoyage des anciens items auto-générés
    await db.shopping_list.delete_many({
        "user_id": current_user['id'],
        "product_id": {"$ne": None}
    })

    if not low_stock_products:
        return await db.shopping_list.find({"user_id": current_user['id']}, {"_id": 0}).to_list(500)

    # 3. Préparation de la liste d'insertion
    new_items_to_insert = []
    for product in low_stock_products:
        quantity_needed = product['min_quantity'] - product['quantity']
        item = ShoppingListItem(
            product_id=product['id'],
            name=product['name'],
            quantity=quantity_needed,
            unit=product.get('unit', 'unité'),
            user_id=current_user['id']
        )
        item_dict = item.model_dump()
        item_dict['created_at'] = item_dict['created_at'].isoformat()
        new_items_to_insert.append(item_dict)

    # 4. Insertion unique au lieu d'une boucle
    if new_items_to_insert:
        await db.shopping_list.insert_many(new_items_to_insert)

    # Retourne la liste complète mise à jour
    return await db.shopping_list.find({"user_id": current_user['id']}, {"_id": 0}).to_list(500)

@api_router.post("/shopping-list", response_model=ShoppingListItemResponse)
async def add_shopping_list_item(item_data: ShoppingListItemCreate, current_user: dict = Depends(get_current_user)):
    item = ShoppingListItem(**item_data.model_dump(), user_id=current_user['id'])
    item_dict = item.model_dump()
    item_dict['created_at'] = item_dict['created_at'].isoformat()
    await db.shopping_list.insert_one(item_dict)
    return item_dict

@api_router.patch("/shopping-list/{item_id}/toggle")
async def toggle_shopping_list_item(item_id: str, current_user: dict = Depends(get_current_user)):
    item = await db.shopping_list.find_one(
        {"id": item_id, "user_id": current_user['id']},
        {"_id": 0}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Article non trouvé")

    new_checked = not item.get('is_checked', False)
    await db.shopping_list.update_one(
        {"id": item_id},
        {"$set": {"is_checked": new_checked}}
    )
    return {"is_checked": new_checked}

@api_router.delete("/shopping-list/{item_id}")
async def delete_shopping_list_item(item_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.shopping_list.delete_one({"id": item_id, "user_id": current_user['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    return {"message": "Article supprimé"}

@api_router.delete("/shopping-list")
async def clear_shopping_list(checked_only: bool = True, current_user: dict = Depends(get_current_user)):
    """Clear shopping list items"""
    query = {"user_id": current_user['id']}
    if checked_only:
        query["is_checked"] = True
    await db.shopping_list.delete_many(query)
    return {"message": "Liste de courses vidée"}


@api_router.post("/shopping-list/bulk", response_model=List[ShoppingListItemResponse])
async def add_shopping_list_items_bulk(
    items_data: List[ShoppingListItemCreate] = Body(...),
    current_user: dict = Depends(get_current_user)
):
    try:
        if not items_data:
            return []

        prepared_items = []
        now = datetime.now(timezone.utc).isoformat()

        for data in items_data:
            item_dict = data.model_dump()
            item_dict.update({
                "id": str(uuid.uuid4()),
                "user_id": current_user['id'],
                "is_checked": False,
                "created_at": now
            })
            prepared_items.append(item_dict)

        await db.shopping_list.insert_many(prepared_items)
        return prepared_items
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== DASHBOARD STATS ====================

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    user_id = current_user['id']

    # Total products
    total_products = await db.products.count_documents({"user_id": user_id})

    # Low stock products
    all_products = await db.products.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    low_stock_count = sum(1 for p in all_products if p['quantity'] < p['min_quantity'])

    # Total categories
    total_categories = await db.categories.count_documents({"user_id": user_id})

    # Total locations
    total_locations = await db.storage_locations.count_documents({"user_id": user_id})

    # Shopping list items count
    shopping_list_count = await db.shopping_list.count_documents({"user_id": user_id, "is_checked": False})

    # Products by category
    products_by_category = {}
    for p in all_products:
        cat_id = p.get('category_id') or 'uncategorized'
        products_by_category[cat_id] = products_by_category.get(cat_id, 0) + 1

    # Recent products (last 5 updated)
    recent_products = await db.products.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("updated_at", -1).limit(5).to_list(5)

    return {
        "total_products": total_products,
        "low_stock_count": low_stock_count,
        "total_categories": total_categories,
        "total_locations": total_locations,
        "shopping_list_count": shopping_list_count,
        "products_by_category": products_by_category,
        "recent_products": recent_products
    }

# ==================== ROOT ====================

@api_router.get("/")
async def root():
    return {"message": "StockHome API v1.0.0"}

# Include the router in the main app
app.include_router(api_router)

# Gestion des CORS pour la prod
origins = os.environ.get('CORS_ORIGINS', '*').split(',')
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()