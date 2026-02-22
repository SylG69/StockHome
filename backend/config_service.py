import os, uuid, boto3
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from boto3.dynamodb.conditions import Key
from jose import jwt

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # En prod, vous pourrez remplacer par votre URL CloudFront
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

table = boto3.resource('dynamodb').Table('ReferenceData')
JWT_SECRET = os.environ.get('JWT_SECRET', 'votre_secret')

def get_user_id(authorization: str):
    try:
        payload = jwt.decode(authorization.replace("Bearer ", ""), JWT_SECRET, algorithms=["HS256"])
        return payload.get("sub")
    except:
        raise HTTPException(status_code=401, detail="Non autorisé")

# --- Logique générique pour éviter la répétition ---
async def list_items(uid: str, prefix: str):
    res = table.query(KeyConditionExpression=Key('user_id').eq(uid) & Key('id').begins_with(prefix))
    return res.get('Items', [])

# --- ROUTES CATEGORIES ---
@app.get("/api/categories")
async def get_cats(uid: str = Depends(get_user_id)):
    return await list_items(uid, "CAT#")

@app.post("/api/categories")
async def add_cat(data: dict, uid: str = Depends(get_user_id)):
    cat_id = f"CAT#{uuid.uuid4()}"
    item = {"user_id": uid, "id": cat_id, "name": data['name'], "icon": data.get('icon')}
    table.put_item(Item=item)
    return item

@app.delete("/api/categories/{cat_id}")
async def del_cat(cat_id: str, uid: str = Depends(get_user_id)):
    table.delete_item(Key={'user_id': uid, 'id': cat_id})
    return {"status": "deleted"}

# --- ROUTES SUBCATEGORIES ---
@app.get("/api/subcategories")
async def get_subs(uid: str = Depends(get_user_id)):
    return await list_items(uid, "SUBCAT#")

@app.post("/api/subcategories")
async def add_sub(data: dict, uid: str = Depends(get_user_id)):
    sub_id = f"SUBCAT#{uuid.uuid4()}"
    item = {"user_id": uid, "id": sub_id, "name": data['name'], "category_id": data.get('category_id')}
    table.put_item(Item=item)
    return item

# --- ROUTES LOCATIONS ---
@app.get("/api/locations")
async def get_locs(uid: str = Depends(get_user_id)):
    return await list_items(uid, "LOC#")

handler = Mangum(app)