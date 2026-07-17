"""Points de terminaison d'authentification pour l'inscription, la connexion,
la connexion via Google et la récupération de l'utilisateur authentifié."""
# pylint: disable=line-too-long

import os
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from google.oauth2 import id_token
from google.auth.transport import requests

import models
import schemas
from auth import create_token, get_current_user, get_current_user_any_status, hash_password, require_admin, verify_password
from database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

APP_ENV = os.getenv("APP_ENV", "production")
IS_STAGING = APP_ENV == "staging"

# Comptes toujours admin + actif, quel que soit l'ordre d'inscription et
# même après un vidage complet de la base (voir aussi la migration Alembic
# add_user_role_status qui applique la même règle aux comptes déjà en base).
ADMIN_EMAILS = {"s.greneron@gmail.com"}


def resolve_role_and_status(email: str, is_first_user: bool) -> tuple[str, str]:
    """Détermine le rôle et le statut initiaux d'un nouveau compte.

    - Un email de ADMIN_EMAILS est toujours admin + actif.
    - Sinon, le tout premier compte de l'instance devient admin + actif
      (bootstrap), pour qu'il y ait toujours quelqu'un pour approuver les
      inscriptions suivantes.
    - Tous les autres comptes sont créés "user" / "pending".
    """
    if email.lower() in ADMIN_EMAILS:
        return "admin", "active"
    if is_first_user:
        return "admin", "active"
    return "user", "pending"

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

# GitHub OAuth App (créée gratuitement sur https://github.com/settings/developers).
# Contrairement à Google (client_id public utilisable seul) et Apple, GitHub
# nécessite un échange "code -> access_token" côté serveur avec un
# client_secret qui ne doit jamais être exposé au frontend.
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
# Doit correspondre EXACTEMENT à la callback URL déclarée dans la config de
# l'OAuth App GitHub, et à celle utilisée par le frontend pour construire
# l'URL d'autorisation (voir LoginPage.jsx / GithubCallbackPage.jsx).
GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "")

GITHUB_API_HEADERS = {"Accept": "application/vnd.github+json", "User-Agent": "StockHome"}


async def _exchange_github_code(code: str) -> str:
    """Échange le code d'autorisation OAuth GitHub contre un access_token."""
    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Connexion GitHub non configurée sur le serveur (GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET manquants)",
        )

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": GITHUB_REDIRECT_URI,
            },
            headers={"Accept": "application/json"},
            timeout=8.0,
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Réponse GitHub invalide lors de l'échange du code") from exc

    access_token = data.get("access_token")
    if not access_token:
        # GitHub renvoie un HTTP 200 même en cas d'erreur, avec le détail
        # dans le corps JSON (ex: code déjà utilisé, expiré, redirect_uri
        # ne correspondant pas à celle déclarée sur l'OAuth App).
        raise HTTPException(
            status_code=401,
            detail=data.get("error_description") or "Code d'autorisation GitHub invalide ou expiré",
        )
    return access_token


async def _fetch_github_profile(access_token: str) -> dict:
    """Récupère le profil GitHub (login, nom, avatar) et l'email principal
    vérifié. L'email n'est présent dans /user que s'il est public : sinon un
    appel séparé à /user/emails est nécessaire (scope 'user:email')."""
    headers = {**GITHUB_API_HEADERS, "Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient() as client:
        user_response = await client.get("https://api.github.com/user", headers=headers, timeout=8.0)
        if user_response.status_code != 200:
            raise HTTPException(status_code=401, detail="Impossible de récupérer le profil GitHub (jeton invalide)")
        profile = user_response.json()

        email = profile.get("email")
        if not email:
            emails_response = await client.get("https://api.github.com/user/emails", headers=headers, timeout=8.0)
            if emails_response.status_code == 200:
                emails = emails_response.json()
                primary_verified = next((e for e in emails if e.get("primary") and e.get("verified")), None)
                any_verified = next((e for e in emails if e.get("verified")), None)
                email = (primary_verified or any_verified or {}).get("email")

    profile["email"] = email
    return profile

def add_demo_products(db: Session, user_id: str):
    """Ajoute des produits de démonstration pour un nouvel utilisateur."""

    categories = {cat.name: cat for cat in db.execute(select(models.Category).where(models.Category.user_id == user_id)).scalars().all()}
    locations = {loc.name: loc for loc in db.execute(select(models.StorageLocation).where(models.StorageLocation.user_id == user_id)).scalars().all()}
    if IS_STAGING:
        print(f"Ajout des produits de démonstration pour l'utilisateur {user_id} : {len(DEMO_PRODUCTS)} produits")
        for prod in DEMO_PRODUCTS:
            category = categories.get(prod["category_name"])
            location = locations.get(prod["location_name"])
            if category and location:
                new_product = models.Product(
                    name=prod["name"],
                    category_id=category.id,
                    location_id=location.id,
                    quantity=prod["quantity"],
                    unit=prod["unit"],
                    user_id=user_id
                )
                db.add(new_product)
        db.commit()

def add_default_categories_and_locations(db: Session, user_id: str):
    """Ajoute des catégories et emplacements par défaut pour un nouvel utilisateur."""
    for cat in DEFAULT_CATEGORIES:
        db.add(models.Category(**cat, user_id=user_id))
    for loc in DEFAULT_LOCATIONS:
        db.add(models.StorageLocation(**loc, user_id=user_id))
    db.commit()

@router.post("/register", response_model=schemas.TokenResponse)
def register(data: schemas.UserRegister, db: Session = Depends(get_db)):
    """Enregistre un nouvel utilisateur et crée des catégories et emplacements par défaut.

    Le tout premier compte créé sur l'instance devient automatiquement admin
    et actif (bootstrap), afin qu'il y ait toujours quelqu'un pour approuver
    les inscriptions suivantes. Tous les autres comptes sont créés avec le
    statut "pending" et doivent être approuvés par un admin avant de pouvoir
    se connecter.
    """
    existing = db.execute(select(models.User).where(models.User.email == data.email)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")

    is_first_user = db.execute(select(models.User.id)).first() is None
    role, account_status = resolve_role_and_status(data.email, is_first_user)

    user = models.User(
        email=data.email,
        username=data.username,
        password_hash=hash_password(data.password),
        role=role,
        status=account_status,
    )
    db.add(user)
    db.flush()

    # Catégories et emplacements par défaut, créés à chaque inscription
    add_default_categories_and_locations(db, user.id)

    add_demo_products(db, user.id)  # Ajout des produits de démonstration pour le nouvel utilisateur

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

    # Garde-fou : un compte de ADMIN_EMAILS reste toujours admin + actif,
    # même s'il a été rétrogradé/désactivé par erreur depuis l'écran de
    # gestion des utilisateurs.
    if user.email.lower() in ADMIN_EMAILS and (user.role != "admin" or user.status != "active"):
        user.role = "admin"
        user.status = "active"
        db.commit()
        db.refresh(user)

    if user.status == "pending":
        raise HTTPException(status_code=403, detail="Votre compte est en attente de validation par un administrateur")
    if user.status == "disabled":
        raise HTTPException(status_code=403, detail="Votre compte a été désactivé")

    token = create_token(user.id)
    return schemas.TokenResponse(access_token=token, user=schemas.UserResponse.model_validate(user))


@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user_any_status)):
    """Renvoie l'utilisateur actuellement authentifié (y compris pending/disabled,
    pour que le frontend puisse afficher l'écran d'attente approprié)."""
    return schemas.UserResponse.model_validate(current_user)


@router.patch("/me", response_model=schemas.UserResponse)
def update_me(
    data: schemas.ProfileUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Met à jour son propre profil : nom d'utilisateur et/ou mot de passe.
    Le rôle et le statut ne sont jamais modifiables ici (voir les routes
    admin dédiées) : un utilisateur ne peut pas s'auto-promouvoir."""
    if data.username is not None:
        username = data.username.strip()
        if not username:
            raise HTTPException(status_code=400, detail="Le nom d'utilisateur ne peut pas être vide")
        current_user.username = username

    if data.first_name is not None:
        current_user.first_name = data.first_name.strip() or None
    if data.last_name is not None:
        current_user.last_name = data.last_name.strip() or None

    if data.new_password:
        if len(data.new_password) < 6:
            raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit contenir au moins 6 caractères")
        # Un compte créé via Google n'a pas de mot de passe existant : pas de
        # vérification d'ancien mot de passe à faire dans ce cas.
        if current_user.password_hash:
            if not data.current_password or not verify_password(data.current_password, current_user.password_hash):
                raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
        current_user.password_hash = hash_password(data.new_password)

    db.commit()
    db.refresh(current_user)
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
        email = id_info.get('email')
        google_id = id_info.get('sub')   # Identifiant unique de l'utilisateur chez Google
        name = id_info.get('name', '')  # Fallback si pas de name défini

        if not email:
            raise HTTPException(status_code=400, detail="L'email Google est introuvable")

        # 2. Chercher si l'utilisateur existe déjà avec cet email
        user = db.execute(select(models.User).where(models.User.email == email)).scalar_one_or_none()

        if not user:
            # L'utilisateur n'existe pas : INSCRIPTION AUTOMATIQUE
            is_first_user = db.execute(select(models.User.id)).first() is None
            role, account_status = resolve_role_and_status(email, is_first_user)
            user = models.User(
                email=email,
                username=name if name else email.split('@')[0], # Fallback propre pour le username
                google_id=google_id,
                password_hash=None, # Pas de mot de passe stocké chez nous
                role=role,
                status=account_status,
            )
            db.add(user)
            db.flush()

            add_default_categories_and_locations(db, user.id)
            add_demo_products(db, user.id)  # Ajout des produits de démonstration pour le nouvel utilisateur

            db.commit()
            db.refresh(user)

        elif not getattr(user, 'google_id', None):
            # L'utilisateur existait (compte classique), mais se connecte via Google pour la première fois
            user.google_id = google_id
            db.commit()
            db.refresh(user)

        if user.status == "pending":
            raise HTTPException(status_code=403, detail="Votre compte est en attente de validation par un administrateur")
        if user.status == "disabled":
            raise HTTPException(status_code=403, detail="Votre compte a été désactivé")

        # 3. Génération du token JWT interne de l'application
        token = create_token(user.id)

        # Renvoie le même schéma (schemas.TokenResponse) que /login et /register pour simplifier le React
        return schemas.TokenResponse(
            access_token=token,
            user=schemas.UserResponse.model_validate(user)
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Jeton Google invalide ou expiré"
        ) from exc


@router.post("/github", response_model=schemas.TokenResponse)
async def auth_github(body: schemas.GithubTokenBody, db: Session = Depends(get_db)):
    """Authentifie un utilisateur via GitHub OAuth (flux "authorization
    code" : le frontend a redirigé vers github.com, GitHub a redirigé vers
    la page de callback avec un `code`, transmis ici) et renvoie un jeton
    d'accès pour l'application. Miroir de /auth/google."""
    access_token = await _exchange_github_code(body.code)
    profile = await _fetch_github_profile(access_token)

    email = profile.get("email")
    github_id = str(profile["id"]) if profile.get("id") is not None else None

    if not email:
        raise HTTPException(
            status_code=400,
            detail="Aucun email vérifié trouvé sur ce compte GitHub. Ajoutez/vérifiez un email dans vos paramètres GitHub puis réessayez.",
        )
    if not github_id:
        raise HTTPException(status_code=400, detail="Identifiant GitHub introuvable")

    user = db.execute(select(models.User).where(models.User.email == email)).scalar_one_or_none()

    if not user:
        # L'utilisateur n'existe pas : INSCRIPTION AUTOMATIQUE
        is_first_user = db.execute(select(models.User.id)).first() is None
        role, account_status = resolve_role_and_status(email, is_first_user)

        user = models.User(
            email=email,
            username=profile.get("login") or email.split("@")[0],  # "login" = le pseudo GitHub, toujours présent
            github_id=github_id,
            password_hash=None,  # Pas de mot de passe stocké chez nous
            role=role,
            status=account_status,
        )
        db.add(user)
        db.flush()

        add_default_categories_and_locations(db, user.id)
        add_demo_products(db, user.id)

        db.commit()
        db.refresh(user)

    elif not getattr(user, "github_id", None):
        # L'utilisateur existait (compte classique ou Google), mais se
        # connecte via GitHub pour la première fois : on lie les comptes.
        user.github_id = github_id
        db.commit()
        db.refresh(user)

    # Garde-fou : un compte de ADMIN_EMAILS reste toujours admin + actif.
    if user.email.lower() in ADMIN_EMAILS and (user.role != "admin" or user.status != "active"):
        user.role = "admin"
        user.status = "active"
        db.commit()
        db.refresh(user)

    if user.status == "pending":
        raise HTTPException(status_code=403, detail="Votre compte est en attente de validation par un administrateur")
    if user.status == "disabled":
        raise HTTPException(status_code=403, detail="Votre compte a été désactivé")

    token = create_token(user.id)
    return schemas.TokenResponse(access_token=token, user=schemas.UserResponse.model_validate(user))


# ==================== ADMINISTRATION DES UTILISATEURS ====================
# Toutes les routes ci-dessous sont réservées aux comptes avec role="admin"
# (voir la dépendance require_admin). Elles permettent d'approuver ou de
# refuser les nouveaux comptes ("pending"), ainsi que d'activer/désactiver
# des comptes existants et de changer leur rôle.

VALID_STATUSES = {"pending", "active", "disabled"}
VALID_ROLES = {"admin", "user"}


@router.get("/users", response_model=list[schemas.UserResponse])
def list_users(
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Liste tous les utilisateurs de l'application (admin uniquement)."""
    users = db.execute(select(models.User).order_by(models.User.created_at.asc())).scalars().all()
    return [schemas.UserResponse.model_validate(u) for u in users]


@router.patch("/users/{user_id}/status", response_model=schemas.UserResponse)
def update_user_status(
    user_id: str,
    data: schemas.UserStatusUpdate,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Approuve, refuse (désactive) ou réactive un compte utilisateur (admin uniquement)."""
    if data.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Statut invalide")

    target = db.execute(select(models.User).where(models.User.id == user_id)).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas modifier votre propre statut")

    if target.email.lower() in ADMIN_EMAILS and data.status != "active":
        raise HTTPException(status_code=400, detail="Ce compte administrateur ne peut pas être désactivé")

    target.status = data.status
    db.commit()
    db.refresh(target)
    return schemas.UserResponse.model_validate(target)


@router.patch("/users/{user_id}/role", response_model=schemas.UserResponse)
def update_user_role(
    user_id: str,
    data: schemas.UserRoleUpdate,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Change le rôle (admin/user) d'un utilisateur (admin uniquement)."""
    if data.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Rôle invalide")

    target = db.execute(select(models.User).where(models.User.id == user_id)).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas modifier votre propre rôle")

    if target.email.lower() in ADMIN_EMAILS and data.role != "admin":
        raise HTTPException(status_code=400, detail="Ce compte doit rester administrateur")

    target.role = data.role
    db.commit()
    db.refresh(target)
    return schemas.UserResponse.model_validate(target)


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Supprime un compte (typiquement pour refuser une inscription en attente)."""
    target = db.execute(select(models.User).where(models.User.id == user_id)).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte")

    if target.email.lower() in ADMIN_EMAILS:
        raise HTTPException(status_code=400, detail="Ce compte administrateur ne peut pas être supprimé")

    db.delete(target)
    db.commit()
    return {"message": "Utilisateur supprimé"}
