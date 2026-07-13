"""Points de terminaison d'authentification pour l'inscription, la connexion,
la connexion via Google et la récupération de l'utilisateur authentifié."""

import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from google.oauth2 import id_token
from google.auth.transport import requests

import models
import schemas
from auth import create_token, get_current_user, hash_password, verify_password
from database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

APP_ENV = os.getenv("APP_ENV", "production")
IS_STAGING = APP_ENV == "staging"

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

DEMO_PRODUCTS = [
    {"name": "Lait",                    "category_name": "Alimentaire", "location_name": "Réfrigérateur",   "quantity": 2,  "unit": "L"},
    {"name": "Pain",                    "category_name": "Alimentaire", "location_name": "Cuisine",         "quantity": 1,  "unit": "pièce"},
    {"name": "Shampoing",               "category_name": "Hygiène",     "location_name": "Salle de bain",   "quantity": 1,  "unit": "bouteille"},
    {"name": "Lessive",                 "category_name": "Entretien",   "location_name": "Garage",          "quantity": 1,  "unit": "bidon"},
    {"name": "Croquettes pour chien",   "category_name": "Animaux",     "location_name": "Garage",          "quantity": 5,  "unit": "kg"},
    {"name": "Coca-Cola",               "category_name": "Boissons",    "location_name": "Réfrigérateur",   "quantity": 6,  "unit": "canettes"},
    {"name": "Eau minérale",            "category_name": "Boissons",    "location_name": "Réfrigérateur",   "quantity": 12, "unit": "bouteilles"},
    {"name": "Savon",                   "category_name": "Hygiène",     "location_name": "Salle de bain",   "quantity": 3,  "unit": "barres"},
    {"name": "Éponge",                  "category_name": "Entretien",   "location_name": "Cuisine",         "quantity": 2,  "unit": "pièces"},
    {"name": "Croquettes pour chat",    "category_name": "Animaux",     "location_name": "Garage",          "quantity": 3,  "unit": "kg"},
    {"name": "Jus d'orange",            "category_name": "Boissons",    "location_name": "Réfrigérateur",   "quantity": 2,  "unit": "bouteilles"},
]

GOOGLE_CLIENT_ID = "168521676002-u4gd6ltbs8kknb8noim1q7dhtkcpusk6.apps.googleusercontent.com"

@router.post("/register", response_model=schemas.TokenResponse)
def register(data: schemas.UserRegister, db: Session = Depends(get_db)):
    """Enregistre un nouvel utilisateur et crée des catégories et emplacements par défaut."""
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
    """Authentifie un utilisateur et renvoie un jeton d'accès JWT."""
    user = db.execute(select(models.User).where(models.User.email == credentials.email)).scalar_one_or_none()

    # Sécurité : Si un utilisateur Google tente de se connecter en classique,
    # password_hash sera probablement vide ou invalide, bloquant l'accès.
    if not user or not user.password_hash or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    token = create_token(user.id)
    return schemas.TokenResponse(access_token=token, user=schemas.UserResponse.model_validate(user))


@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    """Renvoie l'utilisateur actuellement authentifié."""
    return schemas.UserResponse.model_validate(current_user)

@router.post("/google", response_model=schemas.TokenResponse)
async def auth_google(body: schemas.GoogleTokenBody, db: Session = Depends(get_db)):
    """Authentifie un utilisateur via Google OAuth2 et renvoie un jeton d'accès pour l'application."""
    try:
        # Le serveur valide le jeton JWT directement auprès de Google
        id_info = id_token.verify_oauth2_token(
            body.token,
            requests.Request(),
            GOOGLE_CLIENT_ID
        )

        # Si le jeton est valide, on extrait les informations sécurisées
        user_id = id_info['sub']  # Identifiant unique de l'utilisateur chez Google
        email = id_info.get('email')
        google_id = id_info.get('sub')   # Identifiant unique de l'utilisateur chez Google
        name = id_info.get('name', '')  # Fallback si pas de name défini

        if not email:
            raise HTTPException(status_code=400, detail="L'email Google est introuvable")

        # 2. Chercher si l'utilisateur existe déjà avec cet email
        user = db.execute(select(models.User).where(models.User.email == email)).scalar_one_or_none()

        if not user:
            # L'utilisateur n'existe pas : INSCRIPTION AUTOMATIQUE
            user = models.User(
                email=email,
                username=name if name else email.split('@')[0], # Fallback propre pour le username
                google_id=google_id,
                password_hash=None # Pas de mot de passe stocké chez nous
            )
            db.add(user)
            db.flush()

            # Injection des catégories et emplacements par défaut obligatoires pour l'application
            if IS_STAGING:
                for cat in DEFAULT_CATEGORIES:
                    db.add(models.Category(**cat, user_id=user.id))
                for loc in DEFAULT_LOCATIONS:
                    db.add(models.StorageLocation(**loc, user_id=user.id))

                for product in DEMO_PRODUCTS:
                    category = db.execute(
                        select(models.Category).where(
                            models.Category.name == product["category_name"],
                            models.Category.user_id == user.id
                        )
                    ).scalar_one_or_none()
                    location = db.execute(
                        select(models.StorageLocation).where(
                            models.StorageLocation.name == product["location_name"],
                            models.StorageLocation.user_id == user.id
                        )
                    ).scalar_one_or_none()

                    if category and location:
                        product_data = schemas.ProductBase(
                            name=product["name"],
                            quantity=product["quantity"],
                            unit=product["unit"],
                            category_id=str(category.id),
                            location_id=str(location.id),
                        )
                        db.add(models.Product(**product_data.model_dump(), user_id=user.id))

            db.commit()
            db.refresh(user)

        elif not getattr(user, 'google_id', None):
            # L'utilisateur existait (compte classique), mais se connecte via Google pour la première fois
            user.google_id = google_id
            db.commit()
            db.refresh(user)

        # 3. Génération du token JWT interne de l'application
        token = create_token(user.id)

        # Renvoie le même schéma (schemas.TokenResponse) que /login et /register pour simplifier le React
        return schemas.TokenResponse(
            access_token=token,
            user=schemas.UserResponse.model_validate(user)
        )

    except ValueError:
        # Le jeton Google est corrompu, modifié ou expiré
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Jeton Google invalide ou expiré"
        )
