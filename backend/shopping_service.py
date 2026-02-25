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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # En prod, vous pourrez remplacer par votre URL CloudFront
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

region = os.environ.get('AWS_REGION', 'eu-west-3')
dynamodb = boto3.resource('dynamodb', region_name=region)
table = dynamodb.Table(os.environ.get('SHOPPING_TABLE', 'StockHome-ShoppingList'))
table_products = dynamodb.Table(os.environ.get('PRODUCTS_TABLE', 'StockHome-Products'))
table_ref = dynamodb.Table(os.environ.get('REF_TABLE', 'StockHome-ReferenceData'))

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

def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Session expirée")

@app.get("/api/shopping-list", response_model=List[ShoppingListItem])
def get_shopping_list(uid: str = Depends(get_current_user_id)):
    res = table.query(KeyConditionExpression=Key('user_id').eq(uid))
    return res.get('Items', [])

@app.post("/api/shopping-list")
def add_item(item_in: ShoppingListItemCreate, uid: str = Depends(get_current_user_id)):
    item = {
        "user_id": uid, "id": str(uuid.uuid4()), "name": item_in.name,
        "quantity": item_in.quantity, "unit": item_in.unit, "is_checked": False,
        "added_at": datetime.now(timezone.utc).isoformat()
    }
    table.put_item(Item=item)
    return item

def generate_list(uid: str = Depends(get_current_user_id)):
    # A. On récupère les sous-catégories de l'utilisateur
    # Note: On filtre pour ne prendre que les items qui ont un type 'subcategory'
    # ou simplement tous les items de ReferenceData liés à l'utilisateur
    ref_res = table_ref.query(KeyConditionExpression=Key('user_id').eq(uid))
    all_refs = ref_res.get('Items', [])

    # B. On filtre celles qui sont en alerte (current_stock <= min_stock)
    # On ignore les catégories principales (qui n'ont pas de parent_id ou ont un flag spécifique)
    to_add = []
    for item in all_refs:
        # On vérifie si c'est une sous-catégorie (elle a un parent_id)
        if item.get('parent_id'):
            current = int(item.get('current_stock', 0))
            threshold = int(item.get('min_stock', 0))

            if current <= threshold:
                to_add.append(item)

    # C. On vérifie ce qui est déjà dans la liste de courses pour éviter les doublons
    shop_res = table.query(KeyConditionExpression=Key('user_id').eq(uid))
    existing_names = {item['name'].lower() for item in shop_res.get('Items', [])}

    added_count = 0
    with table.batch_writer() as batch:
        for sub in to_add:
            if sub['name'].lower() not in existing_names:
                batch.put_item(Item={
                    "user_id": uid,
                    "id": str(uuid.uuid4()),
                    "name": sub['name'], # On ajoute le nom de la sous-catégorie (ex: "Pâtes")
                    "quantity": 1,
                    "unit": "unité",
                    "is_checked": False,
                    "added_at": datetime.now(timezone.utc).isoformat()
                })
                added_count += 1

    return {"added": added_count}

@app.delete("/api/shopping-list/{item_id}")
def delete_item(item_id: str, uid: str = Depends(get_current_user_id)):
    table.delete_item(Key={'user_id': uid, 'id': item_id})
    return {"status": "deleted"}

handler = Mangum(app)