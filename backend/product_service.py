from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

import models
import schemas
from auth import get_current_user
from database import get_db

router = APIRouter(prefix="/api", tags=["products"])


def _enrich_product(product: models.Product) -> schemas.ProductResponse:
    data = schemas.ProductResponse.model_validate(product)
    data.category_name = product.category.name if product.category else None
    data.location_name = product.location.name if product.location else None
    data.sub_category_name = product.sub_category.name if product.sub_category else None
    return data


@router.get("/products", response_model=list[schemas.ProductResponse])
def get_products(
    category_id: Optional[str] = None,
    location_id: Optional[str] = None,
    low_stock: Optional[bool] = None,
    search: Optional[str] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(models.Product).where(models.Product.user_id == current_user.id).options(
        selectinload(models.Product.category),
        selectinload(models.Product.location),
        selectinload(models.Product.sub_category),
    )
    if category_id:
        query = query.where(models.Product.category_id == category_id)
    if location_id:
        query = query.where(models.Product.location_id == location_id)
    if search:
        like = f"%{search}%"
        query = query.where(
            or_(models.Product.name.ilike(like), models.Product.barcode.ilike(like), models.Product.brand.ilike(like))
        )
    if low_stock:
        query = query.where(models.Product.quantity < models.Product.min_quantity)

    products = db.execute(query).scalars().all()
    return [_enrich_product(p) for p in products]


@router.get("/products/barcode/{barcode}", response_model=schemas.ProductResponse)
def get_product_by_barcode(
    barcode: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    product = db.execute(
        select(models.Product)
        .where(models.Product.barcode == barcode, models.Product.user_id == current_user.id)
        .options(selectinload(models.Product.category), selectinload(models.Product.location), selectinload(models.Product.sub_category))
    ).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Produit non trouvé")
    return _enrich_product(product)


@router.get("/products/{product_id}", response_model=schemas.ProductResponse)
def get_product(
    product_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    product = db.execute(
        select(models.Product)
        .where(models.Product.id == product_id, models.Product.user_id == current_user.id)
        .options(selectinload(models.Product.category), selectinload(models.Product.location), selectinload(models.Product.sub_category))
    ).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Produit non trouvé")
    return _enrich_product(product)


def _validate_owned_refs(
    db: Session,
    user_id: str,
    category_id: Optional[str] = None,
    sub_category_id: Optional[str] = None,
    location_id: Optional[str] = None,
) -> None:
    """
    Vérifie que les identifiants fournis (catégorie, sous-catégorie,
    emplacement) existent bien et appartiennent à l'utilisateur courant.
    Évite qu'une valeur invalide (bug frontend, appel API direct, etc.)
    ne remonte comme une IntegrityError PostgreSQL brute (500) au lieu
    d'une erreur 400 claire.
    """
    checks = [
        (category_id, models.Category, "category_id"),
        (sub_category_id, models.SubCategory, "sub_category_id"),
        (location_id, models.StorageLocation, "location_id"),
    ]
    for value, model, field_name in checks:
        if not value:
            continue
        exists = db.execute(
            select(model.id).where(model.id == value, model.user_id == user_id)
        ).scalar_one_or_none()
        if exists is None:
            raise HTTPException(status_code=400, detail=f"{field_name} invalide ou introuvable : {value}")


def _resolve_sub_category_id(
    db: Session,
    user_id: str,
    sub_category_name: Optional[str],
    sub_category_id: Optional[str],
    category_id: Optional[str],
) -> Optional[str]:
    """
    Si un sub_category_id explicite est fourni, on le garde tel quel (déjà
    validé par _validate_owned_refs). Sinon, si un nom est fourni, on
    réutilise la sous-catégorie existante du même nom (insensible à la
    casse) ou on la crée à la volée, rattachée à category_id si fourni.
    """
    if sub_category_id or not sub_category_name:
        return sub_category_id

    sub_category_name = sub_category_name.strip().capitalize()
    if not sub_category_name:
        return sub_category_id

    existing_sub = db.execute(
        select(models.SubCategory).where(
            models.SubCategory.user_id == user_id,
            func.lower(models.SubCategory.name) == sub_category_name.lower(),
        )
    ).scalar_one_or_none()
    if existing_sub:
        return existing_sub.id

    new_sub = models.SubCategory(name=sub_category_name, user_id=user_id, category_id=category_id)
    db.add(new_sub)
    db.flush()
    return new_sub.id


@router.post("/products", response_model=schemas.ProductResponse)
def create_product(
    data: schemas.ProductCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload = data.model_dump()
    sub_category_name = payload.pop("sub_category_name", None)

    _validate_owned_refs(
        db, current_user.id,
        category_id=payload.get("category_id"),
        sub_category_id=payload.get("sub_category_id"),
        location_id=payload.get("location_id"),
    )

    payload["sub_category_id"] = _resolve_sub_category_id(
        db, current_user.id, sub_category_name, payload.get("sub_category_id"), payload.get("category_id"),
    )

    product = models.Product(**payload, user_id=current_user.id)
    db.add(product)
    db.commit()

    product = db.execute(
        select(models.Product)
        .where(models.Product.id == product.id)
        .options(selectinload(models.Product.category), selectinload(models.Product.location), selectinload(models.Product.sub_category))
    ).scalar_one()
    return _enrich_product(product)


@router.put("/products/{product_id}", response_model=schemas.ProductResponse)
def update_product(
    product_id: str,
    data: schemas.ProductUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    product = db.execute(
        select(models.Product)
        .where(models.Product.id == product_id, models.Product.user_id == current_user.id)
        .options(selectinload(models.Product.category), selectinload(models.Product.location), selectinload(models.Product.sub_category))
    ).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Produit non trouvé")

    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    sub_category_name = update_data.pop("sub_category_name", None)

    _validate_owned_refs(
        db, current_user.id,
        category_id=update_data.get("category_id"),
        sub_category_id=update_data.get("sub_category_id"),
        location_id=update_data.get("location_id"),
    )

    if sub_category_name and not update_data.get("sub_category_id"):
        update_data["sub_category_id"] = _resolve_sub_category_id(
            db, current_user.id, sub_category_name, None,
            update_data.get("category_id", product.category_id),
        )

    for key, value in update_data.items():
        setattr(product, key, value)
    product.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(product, attribute_names=["category", "location", "sub_category"])
    return _enrich_product(product)


@router.patch("/products/{product_id}/quantity")
def update_product_quantity(
    product_id: str,
    delta: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Incrémente ou décrémente la quantité d'un produit."""
    product = db.execute(
        select(models.Product).where(models.Product.id == product_id, models.Product.user_id == current_user.id)
    ).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Produit non trouvé")

    product.quantity = max(0, product.quantity + delta)
    product.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"quantity": product.quantity}


@router.delete("/products/{product_id}")
def delete_product(
    product_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    product = db.execute(
        select(models.Product).where(models.Product.id == product_id, models.Product.user_id == current_user.id)
    ).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Produit non trouvé")
    db.delete(product)
    db.commit()
    return {"message": "Produit supprimé"}


@router.get("/barcode/{barcode}", response_model=schemas.OpenFoodFactsProduct)
async def lookup_barcode(barcode: str):
    """
    Recherche d'informations produit sur les bases Open*Facts (appel HTTP
    externe, reste async). Interroge Open Food Facts, Open Beauty Facts puis
    Open Pet Food Facts dans l'ordre, s'arrête à la première réponse trouvée.
    """
    sources = [
        ("Open Food Facts", f"https://world.openfoodfacts.org/api/v0/product/{barcode}.json"),
        ("Open Beauty Facts", f"https://world.openbeautyfacts.org/api/v0/product/{barcode}.json"),
        ("Open Pet Food Facts", f"https://world.openpetfoodfacts.org/api/v0/product/{barcode}.json"),
    ]

    product = None
    matched_source = None

    async with httpx.AsyncClient() as client:
        for source_name, url in sources:
            try:
                response = await client.get(url, timeout=4.0)
                if response.status_code == 200:
                    data = response.json()
                    if data.get("status") == 1:
                        product = data.get("product", {})
                        matched_source = source_name
                        break  # produit trouvé, on arrête là
            except (httpx.TimeoutException, httpx.RequestError):
                # cette base est en timeout/injoignable : on tente la suivante
                continue

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Produit non trouvé sur les bases de données partenaires (Alimentaire, Animaux, Cosmétiques)",
        )

    # NB : "categories_old" est un champ déprécié par Open Food Facts, absent
    # des réponses actuelles -- on utilise "categories" (texte lisible,
    # ex: "Beurres de cacahuètes, Beurres de fruits à coques"), qui est bien
    # présent. Le premier élément est en pratique le plus spécifique.
    categories_str = product.get("categories", "")

    def clean_categories(raw: str) -> list[str]:
        if not raw or not isinstance(raw, str):
            return []
        cleaned = []
        for tag in raw.split(","):
            value = tag.strip().split(":")[-1].replace("-", " ").capitalize()
            if value:
                cleaned.append(value)
        return cleaned

    suggestions = clean_categories(categories_str)

    # Présélection de la catégorie StockHome selon la base qui a répondu :
    # une correspondance directe et fiable, indépendante du contenu produit.
    SOURCE_TO_CATEGORY = {
        "Open Food Facts": "Alimentaire",
        "Open Beauty Facts": "Hygiène",
        "Open Pet Food Facts": "Animaux",
    }
    suggested_category = SOURCE_TO_CATEGORY.get(matched_source)

    # Heuristique "à conserver au frais" : recherche de mots-clés dans les
    # tags de catégorie anglais (stables, indépendants de la langue), qui
    # couvrent les familles de produits typiquement réfrigérés.
    REFRIGERATION_KEYWORDS = [
        "dairy", "dairies", "cheese", "yogurt", "yoghurt", "butter", "cream",
        "fresh", "meat", "fish", "seafood", "deli", "cold-cuts", "sausage",
        "ham", "milk", "charcuterie",
    ]
    categories_tags = " ".join(product.get("categories_tags", []) or []).lower()
    needs_refrigeration = any(keyword in categories_tags for keyword in REFRIGERATION_KEYWORDS)

    return schemas.OpenFoodFactsProduct(
        barcode=barcode,
        name=product.get("product_name") or product.get("product_name_fr"),
        brand=product.get("brands"),
        image_url=product.get("image_url") or product.get("image_front_url"),
        categories=product.get("categories"),
        sub_categories_suggestions=suggestions,
        quantity_info=product.get("quantity"),
        source=matched_source,
        suggested_category=suggested_category,
        needs_refrigeration=needs_refrigeration,
    )