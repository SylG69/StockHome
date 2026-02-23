import os, uuid, boto3
from typing import List
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from mangum import Mangum
from boto3.dynamodb.conditions import Key
from datetime import datetime, timezone
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

region = os.environ.get('AWS_REGION', 'eu-west-3')
dynamodb = boto3.resource('dynamodb', region_name=region)
table = dynamodb.Table(os.environ.get('SHOPPING_TABLE', 'StockHome-ShoppingList'))
t_products = dynamodb.Table(os.environ.get('PRODUCTS_TABLE', 'StockHome-Products'))

JWT_SECRET = os.environ.get('JWT_SECRET', 'votre_secret_tres_long')
ALGORITHM = "HS256"
security = HTTPBearer()

class ShoppingListItem(BaseModel):
    id: str
    name: str
    quantity: float
    unit: str = "unité"
    is_checked: bool = False
    added_at: str

class ShoppingListItemCreate(BaseModel):
    name: str
    quantity: float = 1.0
    unit: str = "unité"

async def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Session expirée")

@app.get("/api/shopping-list", response_model=List[ShoppingListItem])
async def get_shopping_list(uid: str = Depends(get_current_user_id)):
    res = table.query(KeyConditionExpression=Key('user_id').eq(uid))
    return res.get('Items', [])

@app.post("/api/shopping-list")
async def add_item(item_in: ShoppingListItemCreate, uid: str = Depends(get_current_user_id)):
    item = {
        "user_id": uid, "id": str(uuid.uuid4()), "name": item_in.name,
        "quantity": item_in.quantity, "unit": item_in.unit, "is_checked": False,
        "added_at": datetime.now(timezone.utc).isoformat()
    }
    table.put_item(Item=item)
    return item

@app.get("/api/shopping-list/generate")
async def generate_list(uid: str = Depends(get_current_user_id)):
    prods_res = t_products.query(KeyConditionExpression=Key('user_id').eq(uid))
    to_add = [p for p in prods_res.get('Items', []) if float(p.get('current_stock', 0)) <= float(p.get('min_stock', 0))]

    shop_res = table.query(KeyConditionExpression=Key('user_id').eq(uid))
    existing_names = {item['name'].lower() for item in shop_res.get('Items', [])}

    added_count = 0
    with table.batch_writer() as batch:
        for p in to_add:
            if p['name'].lower() not in existing_names:
                batch.put_item(Item={
                    "user_id": uid, "id": str(uuid.uuid4()), "name": p['name'],
                    "quantity": 1, "unit": p.get('unit', 'unité'), "is_checked": False,
                    "added_at": datetime.now(timezone.utc).isoformat()
                })
                added_count += 1
    return {"message": f"{added_count} articles ajoutés"}

@app.delete("/api/shopping-list/{item_id}")
async def delete_item(item_id: str, uid: str = Depends(get_current_user_id)):
    table.delete_item(Key={'user_id': uid, 'id': item_id})
    return {"status": "deleted"}

handler = Mangum(app)