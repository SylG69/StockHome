import os, uuid, boto3, httpx
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from mangum import Mangum
from boto3.dynamodb.conditions import Key
from datetime import datetime, timezone
from jose import jwt, JWTError

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

region = os.environ.get('AWS_REGION', 'eu-west-3')
dynamodb = boto3.resource('dynamodb', region_name=region)
table = dynamodb.Table(os.environ.get('PRODUCTS_TABLE', 'StockHome-Products'))

JWT_SECRET = os.environ.get('JWT_SECRET', 'votre_secret_tres_long')
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

class ProductBase(BaseModel):
    name: str
    barcode: Optional[str] = None
    current_stock: float = 0
    min_stock: float = 1
    unit: str = "unité"
    category_id: Optional[str] = None
    subcategory_id: Optional[str] = None
    location_id: Optional[str] = None
    image_url: Optional[str] = None

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None: raise HTTPException(status_code=401)
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

@app.get("/api/products")
async def list_products(uid: str = Depends(get_current_user)):
    response = table.query(KeyConditionExpression=Key('user_id').eq(uid))
    return response.get('Items', [])

@app.post("/api/products")
async def create_product(product: ProductBase, uid: str = Depends(get_current_user)):
    product_id = str(uuid.uuid4())
    item = product.model_dump()
    item.update({
        "user_id": uid,
        "id": product_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    })
    table.put_item(Item=item)
    return item

@app.patch("/api/products/{product_id}/quantity")
async def update_quantity(product_id: str, delta: float, uid: str = Depends(get_current_user)):
    try:
        response = table.update_item(
            Key={'user_id': uid, 'id': product_id},
            UpdateExpression="SET current_stock = current_stock + :val, updated_at = :now",
            ExpressionAttributeValues={':val': delta, ':now': datetime.now(timezone.utc).isoformat()},
            ReturnValues="UPDATED_NEW"
        )
        return response.get('Attributes')
    except Exception:
        raise HTTPException(status_code=404, detail="Produit non trouvé")

@app.get("/api/barcode/{barcode}")
async def scan_barcode(barcode: str):
    async with httpx.AsyncClient() as client:
        url = f"https://world.openfoodfacts.org/api/v0/product/{barcode}.json"
        response = await client.get(url)
        if response.status_code == 200:
            data = response.json()
            if data.get('status') == 1:
                p = data['product']
                return {"name": p.get('product_name', 'Inconnu'), "image_url": p.get('image_url'), "brand": p.get('brands')}
    raise HTTPException(status_code=404, detail="Produit non trouvé")

@app.delete("/api/products/{product_id}")
async def delete_product(product_id: str, uid: str = Depends(get_current_user)):
    table.delete_item(Key={'user_id': uid, 'id': product_id})
    return {"message": "Supprimé"}

handler = Mangum(app)
