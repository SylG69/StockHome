import os
import uuid
from datetime import datetime, timezone
from typing import Optional
import httpx
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from mangum import Mangum
import boto3
from boto3.dynamodb.conditions import Key
from jose import jwt, JWTError

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

region = os.environ.get('AWS_REGION', 'eu-west-3')
dynamodb = boto3.resource('dynamodb', region_name=region)
table = dynamodb.Table(os.environ.get('PRODUCTS_TABLE', 'StockHome-Products'))
table_ref = dynamodb.Table(os.environ.get('REF_TABLE', 'StockHome-ReferenceData'))

JWT_SECRET = os.environ.get('JWT_SECRET', 'votre_secret_tres_long')
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

class ProductBase(BaseModel):
    """
    Modèle de base pour un produit
    """
    name: str
    barcode: Optional[str] = None
    quantity: int = 0
    min_quantity: int = 1
    unit: str = "unité"
    brand: Optional[str] = None
    category_id: Optional[str] = None
    sub_category_id: Optional[str] = None
    location_id: Optional[str] = None
    image_url: Optional[str] = None

class SubCategoryUpdate(BaseModel):
    """
    Modèle de mise à jour pour une sous-catégorie
    """
    min_stock: int

def get_current_user(token: str = Depends(oauth2_scheme)):
    """
    Récupère l'utilisateur courant à partir du token JWT
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401)
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

def sync_subcategory_stock(uid: str, sub_category_id: str):
    """
    Fonction pour recalculer et mettre à jour la sous-catégorie
    """
    if not sub_category_id or sub_category_id == "none":
        return

    # A. Calculer la somme de TOUS les produits de cette sous-catégorie pour cet utilisateur
    products_response = table.query(
        KeyConditionExpression=Key('user_id').eq(uid)
    )
    products = products_response.get('Items', [])

    total_qty = sum(
        int(p.get('quantity', 0))
        for p in products
        if p.get('sub_category_id') == sub_category_id
    )

    # B. Mettre à jour la sous-catégorie dans la table ReferenceData
    # On met à jour un champ 'current_stock' dans la sous-catégorie
    try:
        table_ref.update_item(
            Key={'user_id': uid, 'id': sub_category_id},
            UpdateExpression="SET current_stock = :qty, updated_at = :now",
            ExpressionAttributeValues={
                ':qty': total_qty,
                ':now': datetime.now(timezone.utc).isoformat()
            }
        )
    except Exception as e:
        print(f"Erreur synchro sub_cat: {e}")

@app.get("/api/products")
def list_products(uid: str = Depends(get_current_user)):
    """
    Liste des produits
    """
    response = table.query(KeyConditionExpression=Key('user_id').eq(uid))
    return response.get('Items', [])

@app.post("/api/products")
def add_product(data: ProductBase, uid: str = Depends(get_current_user)):
    """
    Ajout d'un produit
    """
    product_id = str(uuid.uuid4())
    item = {
        "user_id": uid,
        "id": product_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **data.model_dump(exclude_none=True)
    }
    table.put_item(Item=item)
    sync_subcategory_stock(uid, data.sub_category_id)
    return item

@app.put("/api/products/{product_id}")
def update_product(product_id: str, data: ProductBase, uid: str = Depends(get_current_user)):
    """
    Mise à jour d'un produit
    """
    item = {
        "user_id": uid,
        "id": product_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        **data.model_dump(exclude_none=True)
    }
    table.put_item(Item=item)
    sync_subcategory_stock(uid, data.sub_category_id)
    return item

@app.patch("/api/products/{product_id}/quantity")
def update_quantity(product_id: str, delta: int, uid: str = Depends(get_current_user)):
    """
    Mise à jour de la quantité d'un produit
    """
    try:
        response = table.update_item(
            Key={'user_id': uid, 'id': product_id},
            UpdateExpression="SET quantity = quantity + :val, updated_at = :now",
            ExpressionAttributeValues={
                ':val': delta,
                ':now': datetime.now(timezone.utc).isoformat()
            },
            ReturnValues="UPDATED_NEW"
        )
        prod = table.get_item(Key={'user_id': uid, 'id': product_id}).get('Item')
        if prod:
            sync_subcategory_stock(uid, prod.get('sub_category_id'))
        return response.get('Attributes')
    except Exception:
        raise HTTPException(status_code=404, detail="Produit non trouvé")

@app.delete("/api/products/{product_id}")
def delete_product(product_id: str, uid: str = Depends(get_current_user)):
    """
    Suppression d'un produit
    """
    table.delete_item(Key={'user_id': uid, 'id': product_id})
    return {"message": "Supprimé"}

@app.get("/api/barcode/{barcode}")
def scan_barcode(barcode: str):
    """
    Scan a barcode
    """
    with httpx.Client() as client:
        url = f"https://world.openfoodfacts.org/api/v0/product/{barcode}.json"
        response = client.get(url)
        if response.status_code == 200:
            data = response.json()
            if data.get('status') == 1:
                p = data['product']
                return {
                    "name": p.get('product_name', 'Inconnu'),
                    "image_url": p.get('image_url'),
                    "brand": p.get('brands'),
                    "barcode": barcode
                }
    raise HTTPException(status_code=404, detail="Produit non trouvé")

@app.patch("/api/subcategories/{sub_id}/threshold")
def update_subcategory_threshold(sub_id: str, data: SubCategoryUpdate, uid: str = Depends(get_current_user)):
    """
    Met à jour uniquement le seuil minimal d'une sous-catégorie
    """
    try:
        table_ref.update_item(
            Key={'user_id': uid, 'id': sub_id},
            UpdateExpression="SET min_stock = :ms, updated_at = :now",
            ExpressionAttributeValues={
                ':ms': data.min_stock,
                ':now': datetime.now(timezone.utc).isoformat()
            }
        )
        return {"status": "success", "min_stock": data.min_stock}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


handler = Mangum(app)
