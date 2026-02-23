import os, uuid, boto3
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, OAuth2PasswordBearer
from mangum import Mangum
from boto3.dynamodb.conditions import Key
from jose import jwt, JWTError

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

# Fonction utilitaire pour récupérer l'utilisateur via le token
async def get_current_user(token: str = Depends(oauth2_scheme)):
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
async def list_items(uid: str, prefix: str):
    res = table.query(KeyConditionExpression=Key('user_id').eq(uid) & Key('id').begins_with(prefix))
    return res.get('Items', [])

# --- ROUTES CATEGORIES ---
@app.get("/api/categories")
async def get_cats(uid: str = Depends(get_current_user)):
    return await list_items(uid, "CAT#")

@app.post("/api/categories")
async def add_cat(data: dict, uid: str = Depends(get_current_user)):
    cat_id = f"CAT#{uuid.uuid4()}"
    item = {"user_id": uid, "id": cat_id, "name": data['name'], "icon": data.get('icon')}
    table.put_item(Item=item)
    return item

@app.delete("/api/categories/{cat_id}")
async def del_cat(cat_id: str, uid: str = Depends(get_current_user)):
    table.delete_item(Key={'user_id': uid, 'id': cat_id})
    return {"status": "deleted"}

# --- ROUTES SUBCATEGORIES ---
@app.get("/api/subcategories")
async def get_subs(uid: str = Depends(get_current_user)):
    return await list_items(uid, "SUBCAT#")

@app.post("/api/subcategories")
async def add_sub(data: dict, uid: str = Depends(get_current_user)):
    sub_id = f"SUBCAT#{uuid.uuid4()}"
    item = {"user_id": uid, "id": sub_id, "name": data['name'], "category_id": data.get('category_id')}
    table.put_item(Item=item)
    return item

# --- ROUTES LOCATIONS ---
@app.get("/api/locations")
async def get_locs(uid: str = Depends(get_current_user)):
    return await list_items(uid, "LOC#")

handler = Mangum(app)
