import os, uuid, boto3
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, OAuth2PasswordBearer
from mangum import Mangum
from boto3.dynamodb.conditions import Key
from jose import jwt, JWTError
from pydantic import BaseModel, Field
from typing import Optional

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # En prod, vous pourrez remplacer par votre URL CloudFront
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Force la région pour être sûr de pointer au bon endroit
region = os.environ.get('AWS_REGION', 'eu-west-3')
dynamodb = boto3.resource('dynamodb', region_name=region)

table = boto3.resource('dynamodb').Table(os.environ.get('REF_TABLE', 'StockHome-ReferenceData'))
JWT_SECRET = os.environ.get('JWT_SECRET', 'votre_secret')
ALGORITHM = "HS256"

# Ce paramètre indique à FastAPI que le token se trouve dans le header Authorization
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# Modèle de base pour la Catégorie
class CategoryBase(BaseModel):
    name: str
    icon: Optional[str] = None
    color: Optional[str] = None

# Modèle pour la Location
class LocationBase(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None

# Fonction utilitaire pour récupérer l'utilisateur via le token
def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        return user_id
    except JWTError:
        raise credentials_exception


# --- Logique générique pour éviter la répétition ---
def list_items(uid: str, prefix: str):
    res = table.query(KeyConditionExpression=Key('user_id').eq(uid) & Key('id').begins_with(prefix))
    return res.get('Items', [])

# --- ROUTES CATEGORIES ---
@app.get("/api/categories")
async def get_cats(uid: str = Depends(get_current_user)):
    return await list_items(uid, "CAT#")

@app.post("/api/categories", response_model=CategoryBase)
async def add_cat(data: CategoryBase, uid: str = Depends(get_current_user)):
    cat_id = f"CAT#{uuid.uuid4()}"
    # .dict() ou .model_dump() transforme l'objet Pydantic en dictionnaire pour DynamoDB
    item = {"user_id": uid, "id": cat_id, **data.model_dump()}
    table.put_item(Item=item)
    return item

@app.delete("/api/categories/{cat_id}")
async def del_cat(cat_id: str, uid: str = Depends(get_current_user)):
    table.delete_item(Key={'user_id': uid, 'id': cat_id})
    return {"status": "deleted"}


@app.put("/api/categories/{cat_id}")
async def update_cat(cat_id: str, data: CategoryBase, uid: str = Depends(get_current_user)):
    """
    Update des catégories
    """
    # TODO faire de même pour les sous-catégories et les emplacements
    try:
        full_id = cat_id if cat_id.startswith("CAT#") else f"CAT#{cat_id}"

        item = {"user_id": uid, "id": full_id, **data.model_dump()}
        table.put_item(Item=item)
        return item
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Champ manquant : {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- ROUTES SUBCATEGORIES ---
@app.get("/api/subcategories")
async def get_subs(uid: str = Depends(get_current_user)):
    return await list_items(uid, "SUBCAT#")

@app.post("/api/subcategories")
async def add_sub(data: dict, uid: str = Depends(get_current_user)):
    sub_id = f"SUBCAT#{uuid.uuid4()}"
    item = {
        "user_id": uid,
        "id": sub_id,
        "name": data['name'],
        "category_id": data.get('category_id')
    }
    table.put_item(Item=item)
    return item

# --- ROUTES LOCATIONS ---
@app.get("/api/locations")
async def get_locs(uid: str = Depends(get_current_user)):
    return await list_items(uid, "LOC#")

@app.post("/api/locations")
async def add_loc(data: LocationBase, uid: str = Depends(get_current_user)):
    loc_id = f"LOC#{uuid.uuid4()}"
    item = {"user_id": uid, "id": loc_id, **data.model_dump()}
    table.put_item(Item=item)
    return item

@app.put("/api/locations/{loc_id}")
async def update_loc(loc_id: str, data: LocationBase, uid: str = Depends(get_current_user)):
    full_id = loc_id if loc_id.startswith("LOC#") else f"LOC#{loc_id}"

    item = {"user_id": uid, "id": full_id, **data.model_dump()}
    table.put_item(Item=item)
    return item

handler = Mangum(app)
