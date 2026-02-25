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
    quantity: float = 0
    min_quantity: float = 1
    unit: str = "unité"
    brand: Optional[str] = None
    category_id: Optional[str] = None
    sub_category_id: Optional[str] = None
    location_id: Optional[str] = None
    image_url: Optional[str] = None

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None: raise HTTPException(status_code=401)
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

@app.get("/api/products")
def list_products(uid: str = Depends(get_current_user)):
    response = table.query(KeyConditionExpression=Key('user_id').eq(uid))
    return response.get('Items', [])

@app.post("/api/products")
def add_product(data: ProductBase, uid: str = Depends(get_current_user)):
    product_id = str(uuid.uuid4())
    item = {
        "user_id": uid,
        "id": product_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # exclude_none=True évite d'envoyer des champs vides à DynamoDB
    product_data = data.model_dump(exclude_none=True)
    item.update(product_data)

    table.put_item(Item=item)
    return item

@app.put("/api/products/{product_id}")
def update_product(product_id: str, data: ProductBase, uid: str = Depends(get_current_user)):
    # On reconstruit l'item complet pour s'assurer que tous les champs sont mis à jour
    item = {
        "user_id": uid,
        "id": product_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        **data.model_dump(exclude_none=True)
    }
    table.put_item(Item=item)
    return item

@app.patch("/api/products/{product_id}/quantity")
def update_quantity(product_id: str, delta: float, uid: str = Depends(get_current_user)):
    try:
        response = table.update_item(
            Key={'user_id': uid, 'id': product_id},
            UpdateExpression="SET quantity = quantity + :val, updated_at = :now",
            ExpressionAttributeValues={':val': delta, ':now': datetime.now(timezone.utc).isoformat()},
            ReturnValues="UPDATED_NEW"
        )
        return response.get('Attributes')
    except Exception:
        raise HTTPException(status_code=404, detail="Produit non trouvé")

@app.delete("/api/products/{product_id}")
def delete_product(product_id: str, uid: str = Depends(get_current_user)):
    table.delete_item(Key={'user_id': uid, 'id': product_id})
    return {"message": "Supprimé"}

handler = Mangum(app)