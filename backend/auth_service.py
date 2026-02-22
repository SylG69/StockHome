import os, sys
import boto3
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from jose import jwt
from mangum import Mangum
import hashlib
import secrets

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # En prod, vous pourrez remplacer par votre URL CloudFront
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

table = boto3.resource('dynamodb').Table('StockHome-Users')

# Configuration JWT (à mettre dans AWS Secrets Manager plus tard)
JWT_SECRET = os.environ.get('JWT_SECRET', 'votre_secret_tres_long')
ALGORITHM = "HS256"

class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str

def hash_password(password: str) -> str:
    """
    Génération d'un salt aléatoire de 32 octets
    """
    salt = secrets.token_hex(16)
    # On crée le hash en combinant password + sel
    hash_obj = hashlib.sha256(f"{password}{salt}".encode('utf-8'))
    # On stocke le sel et le hash ensemble pour pouvoir vérifier plus tard
    return f"{salt}${hash_obj.hexdigest()}"

def verify_password(stored_password: str, provided_password: str) -> bool:
    try:
        salt, stored_hash = stored_password.split('$')
        current_hash = hashlib.sha256(f"{provided_password}{salt}".encode('utf-8')).hexdigest()
        return current_hash == stored_hash
    except ValueError:
        return False

@app.post("/api/auth/register")
async def register(user: UserRegister):
    # Vérifier si l'utilisateur existe déjà
    if 'Item' in table.get_item(Key={'email': user.email}):
        raise HTTPException(status_code=400, detail="Email déjà utilisé")

    hashed_password = hash_password(user.password)
    user_id = str(uuid.uuid4())

    user_item = {
        "email": user.email,
        "id": user_id,
        "username": user.username,
        "password": hashed_password,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    table.put_item(Item=user_item)

    # Pour que le front se connecte direct, on peut aussi générer le token ici
    # ou rester sur votre logique actuelle
    return {"message": "Utilisateur créé", "id": user_id}

@app.post("/api/auth/login")
async def login(data: dict):
    res = table.get_item(Key={'email': data.get('email')})

    # Vérification avec notre nouvelle fonction verify_password
    if 'Item' not in res or not verify_password(res['Item']['password'], data.get('password', '')):
        raise HTTPException(status_code=401, detail="Identifiants invalides")

    user_item = res['Item']

    # Création du Token
    expire = datetime.now(timezone.utc) + timedelta(hours=24)
    to_encode = {"sub": user_item['id'], "exp": expire}
    token = jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_item['id'],
            "email": user_item['email'],
            "username": user_item['username']
        }
    }

handler = Mangum(app)