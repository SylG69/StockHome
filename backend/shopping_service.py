import os
import uuid
import boto3
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from mangum import Mangum
from boto3.dynamodb.conditions import Key
from datetime import datetime, timezone
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

# --- Modèles Pydantic (Adaptés) ---
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

# --- Initialisation AWS ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # En prod, vous pourrez remplacer par votre URL CloudFront
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialisation hors du handler pour réutilisation (Performance)
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ.get('DYNAMODB_TABLE', 'ShoppingList'))

# --- Fonctions de secours pour l'Auth ---
security = HTTPBearer()

async def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        # On décode le token avec la même clé secrète
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token invalide")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Session expirée ou invalide")

# --- Routes API ---

@app.get("/api/shopping-list", response_model=List[ShoppingListItem])
async def get_shopping_list(user_id: str = Depends(get_current_user_id)):
    try:
        response = table.query(
            KeyConditionExpression=Key('user_id').eq(user_id)
        )
        return response.get('Items', [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/shopping-list", response_model=ShoppingListItem)
async def add_item(item_in: ShoppingListItemCreate, user_id: str = Depends(get_current_user_id)):
    new_item = {
        "user_id": user_id,
        "id": str(uuid.uuid4()),
        "name": item_in.name,
        "quantity": item_in.quantity,
        "unit": item_in.unit,
        "is_checked": False,
        "added_at": datetime.now(timezone.utc).isoformat()
    }
    table.put_item(Item=new_item)
    return new_item

@app.patch("/api/shopping-list/{item_id}/toggle")
async def toggle_item(item_id: str, user_id: str = Depends(get_current_user_id)):
    # Récupérer l'état actuel
    res = table.get_item(Key={'user_id': user_id, 'id': item_id})
    if 'Item' not in res:
        raise HTTPException(status_code=404, detail="Item non trouvé")

    new_status = not res['Item'].get('is_checked', False)

    table.update_item(
        Key={'user_id': user_id, 'id': item_id},
        UpdateExpression="SET is_checked = :val",
        ExpressionAttributeValues={':val': new_status}
    )
    return {"status": "updated", "is_checked": new_status}

@app.delete("/api/shopping-list/{item_id}")
async def delete_item(item_id: str, user_id: str = Depends(get_current_user_id)):
    table.delete_item(Key={'user_id': user_id, 'id': item_id})
    return {"status": "deleted"}

@app.delete("/api/shopping-list")
async def clear_checked_items(user_id: str = Depends(get_current_user_id)):
    # DynamoDB ne permet pas de "delete many" par condition facilement.
    # On scan/query d'abord les items cochés puis on les supprime.
    response = table.query(
        KeyConditionExpression=Key('user_id').eq(user_id)
    )
    items = response.get('Items', [])

    with table.batch_writer() as batch:
        for item in items:
            if item.get('is_checked'):
                batch.delete_item(Key={'user_id': user_id, 'id': item['id']})

    return {"status": "cleared"}

@app.get("/api/shopping-list/generate")
async def generate_list(authorization: str = Depends(get_current_user_id)):
    uid = authorization

    # 1. Trouver les produits en rupture (current <= min)
    prods_res = t_products.query(KeyConditionExpression=Key('user_id').eq(uid))
    to_add = [p for p in prods_res.get('Items', []) if float(p.get('current_stock', 0)) <= float(p.get('min_stock', 0))]

    # 2. Récupérer la liste de courses actuelle pour éviter les doublons
    shop_res = t_shopping.query(KeyConditionExpression=Key('user_id').eq(uid))
    existing_names = {item['name'].lower() for item in shop_res.get('Items', [])}

    # 3. Ajouter les manquants
    added_count = 0
    with t_shopping.batch_writer() as batch:
        for p in to_add:
            if p['name'].lower() not in existing_names:
                batch.put_item(Item={
                    "user_id": uid,
                    "id": str(uuid.uuid4()),
                    "name": p['name'],
                    "quantity": 1,
                    "unit": p.get('unit', 'unité'),
                    "is_checked": False,
                    "added_at": datetime.now(timezone.utc).isoformat()
                })
                added_count += 1

    return {"message": f"{added_count} articles ajoutés à la liste"}

# --- Handler pour AWS Lambda ---
handler = Mangum(app)