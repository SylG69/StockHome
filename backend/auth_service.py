import hashlib
import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr
from jose import jwt, JWTError
from mangum import Mangum
import boto3

app = FastAPI()

security = HTTPBearer()

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

table = boto3.resource('dynamodb').Table(os.environ.get('USERS_TABLE', 'StockHome-Users'))

JWT_SECRET = os.environ.get('JWT_SECRET', 'votre_secret_tres_long')
ALGORITHM = "HS256"

# Ce paramètre indique à FastAPI que le token se trouve dans le header Authorization
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

class UserRegister(BaseModel):
    """
    Classe représentant un utilisateur lors de l'enregistrement
    """
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
    """
    Fonction de vérification du mot de passe
    """
    try:
        salt, stored_hash = stored_password.split('$')
        current_hash = hashlib.sha256(f"{provided_password}{salt}".encode('utf-8')).hexdigest()
        return current_hash == stored_hash
    except ValueError:
        return False

# Fonction utilitaire pour récupérer l'utilisateur via le token
async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Décodage du token JWT
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        return user_id # On retourne l'ID de l'utilisateur
    except JWTError:
        raise credentials_exception


@app.post("/api/auth/register")
async def register(user: UserRegister):
    """
    Fonction d'enregistrement d'un nouvel utilisateur
    """
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
    """
    Fonction de login
    """
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

@app.get("/api/auth/me")
async def read_users_me(user_id: str = Depends(get_current_user)):
    """
    Récupère les informations de l'utilisateur dans DynamoDB
    """
    # Optionnel : Aller chercher les infos complètes dans DynamoDB
    # response = table.scan(FilterExpression=Attr('id').eq(user_id))
    # user = response['Items'][0]

    return {
        "id": user_id,
        "status": "active",
        "message": "Connexion réussie"
    }

handler = Mangum(app)
