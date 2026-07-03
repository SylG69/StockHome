from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

import models
import schemas
from auth import create_token, get_current_user, hash_password, verify_password
from database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

DEFAULT_CATEGORIES = [
    {"name": "Alimentaire", "icon": "Apple", "color": "#10B981"},
    {"name": "Boissons", "icon": "Wine", "color": "#3B82F6"},
    {"name": "Hygiène", "icon": "Sparkles", "color": "#8B5CF6"},
    {"name": "Entretien", "icon": "SprayCan", "color": "#F59E0B"},
    {"name": "Animaux", "icon": "PawPrint", "color": "#EF4444"},
    {"name": "Autre", "icon": "Package", "color": "#6B7280"},
]

DEFAULT_LOCATIONS = [
    {"name": "Cuisine", "description": "Placards et étagères de cuisine", "icon": "ChefHat", "color": "#3B82F6"},
    {"name": "Réfrigérateur", "description": "Produits frais", "icon": "Snowflake", "color": "#10B981"},
    {"name": "Salle de bain", "description": "Produits d'hygiène", "icon": "Bath", "color": "#8B5CF6"},
    {"name": "Garage", "description": "Stockage garage", "icon": "Warehouse", "color": "#EF4444"},
]


@router.post("/register", response_model=schemas.TokenResponse)
def register(data: schemas.UserRegister, db: Session = Depends(get_db)):
    existing = db.execute(select(models.User).where(models.User.email == data.email)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")

    user = models.User(
        email=data.email,
        username=data.username,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    db.flush()

    # Catégories et emplacements par défaut, créés à chaque inscription
    for cat in DEFAULT_CATEGORIES:
        db.add(models.Category(**cat, user_id=user.id))
    for loc in DEFAULT_LOCATIONS:
        db.add(models.StorageLocation(**loc, user_id=user.id))

    db.commit()
    db.refresh(user)

    token = create_token(user.id)
    return schemas.TokenResponse(access_token=token, user=schemas.UserResponse.model_validate(user))


@router.post("/login", response_model=schemas.TokenResponse)
def login(credentials: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.execute(select(models.User).where(models.User.email == credentials.email)).scalar_one_or_none()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    token = create_token(user.id)
    return schemas.TokenResponse(access_token=token, user=schemas.UserResponse.model_validate(user))


@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return schemas.UserResponse.model_validate(current_user)