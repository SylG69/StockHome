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

PRODUCT_NOT_FOUND = "Produit non trouvé"


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
    """Renvoie une liste filtrée de produits pour l'utilisateur authentifié."""
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
    """Renvoie un produit par code-barres pour l'utilisateur authentifié."""
    product = db.execute(
        select(models.Product)
        .where(models.Product.barcode == barcode, models.Product.user_id == current_user.id)
        .options(
            selectinload(models.Product.category),
            selectinload(models.Product.location),
            selectinload(models.Product.sub_category),
        )
    ).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail=PRODUCT_NOT_FOUND)
    return _enrich_product(product)


@router.get("/products/{product_id}", response_model=schemas.ProductResponse)
def get_product(
    product_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Renvoie un produit par identifiant pour l'utilisateur authentifié."""
    product = db.execute(
        select(models.Product)
        .where(models.Product.id == product_id, models.Product.user_id == current_user.id)
        .options(
            selectinload(models.Product.category),
            selectinload(models.Product.location),
            selectinload(models.Product.sub_category),
        )
    ).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail=PRODUCT_NOT_FOUND)
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
    """Crée un nouveau produit pour l'utilisateur authentifié."""
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
        .options(
            selectinload(models.Product.category),
            selectinload(models.Product.location),
            selectinload(models.Product.sub_category),
        )
    ).scalar_one()
    return _enrich_product(product)


@router.put("/products/{product_id}", response_model=schemas.ProductResponse)
def update_product(
    product_id: str,
    data: schemas.ProductUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Met à jour un produit existant pour l'utilisateur authentifié."""
    product = db.execute(
        select(models.Product)
        .where(models.Product.id == product_id, models.Product.user_id == current_user.id)
        .options(
            selectinload(models.Product.category),
            selectinload(models.Product.location),
            selectinload(models.Product.sub_category),
        )
    ).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail=PRODUCT_NOT_FOUND)

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
        raise HTTPException(status_code=404, detail=PRODUCT_NOT_FOUND)

    product.quantity = max(0, product.quantity + delta)
    product.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"quantity": product.quantity}


@router.delete("/products/{product_id}")
def delete_product(
    product_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Supprime un produit appartenant à l'utilisateur authentifié."""
    product = db.execute(
        select(models.Product).where(models.Product.id == product_id, models.Product.user_id == current_user.id)
    ).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail=PRODUCT_NOT_FOUND)
    db.delete(product)
    db.commit()
    return {"message": "Produit supprimé"}


# API v3 (version courante recommandée par Open Food Facts ; la v2 est
# dépréciée et la v0 legacy). Les trois bases tournent sur le même serveur
# Product Opener et exposent les mêmes endpoints v3.
OFF_SOURCES = [
    ("Open Food Facts", "https://world.openfoodfacts.org/api/v3/product/{barcode}"),
    ("Open Beauty Facts", "https://world.openbeautyfacts.org/api/v3/product/{barcode}"),
    ("Open Pet Food Facts", "https://world.openpetfoodfacts.org/api/v3/product/{barcode}"),
]

# Open Food Facts impose un User-Agent identifiant l'application, au format
# exact "AppName/Version (ContactEmail)" -- les requêtes anonymes risquent
# d'être assimilées à un bot et bloquées.
# (https://openfoodfacts.github.io/openfoodfacts-server/api/#authentication)
OFF_HEADERS = {"User-Agent": "StockHome/2.0 (s.greneron@gmail.com)"}

# Champs demandés pour la recherche "simple" (scan / rafraîchissement) :
# limiter le payload est recommandé par OFF et accélère la réponse. Le mode
# "information complète" n'utilise pas cette liste (il veut tout).
OFF_SIMPLE_FIELDS = ",".join([
    "product_name", "product_name_fr", "brands",
    "image_url", "image_front_url",
    "categories", "categories_tags", "quantity",
    "nutriscore_grade", "nutrient_levels", "nutriments",
])


async def _fetch_off_product(
    barcode: str, fields: Optional[str] = None
) -> tuple[Optional[dict], Optional[str]]:
    """Interroge Open Food Facts, Open Beauty Facts puis Open Pet Food Facts
    (API v3) dans l'ordre, s'arrête à la première réponse trouvée. Renvoie
    (produit_brut, nom_de_la_source) ou (None, None) si rien n'est trouvé.

    Si `fields` est fourni (liste séparée par des virgules), seuls ces
    champs sont demandés, ce qui allège la réponse.
    """
    params = {"fields": fields} if fields else None
    async with httpx.AsyncClient(headers=OFF_HEADERS) as client:
        for source_name, url_template in OFF_SOURCES:
            try:
                response = await client.get(
                    url_template.format(barcode=barcode), params=params, timeout=4.0
                )
                # En v3, un produit introuvable renvoie un HTTP 404 avec un
                # corps JSON détaillé ; on ne considère que les 200.
                if response.status_code == 200:
                    data = response.json()
                    # v3 : "status" est une chaîne ("success" ou
                    # "success_with_warnings"), contrairement à la v0 où
                    # c'était l'entier 1.
                    status_value = data.get("status")
                    if status_value in ("success", "success_with_warnings") and data.get("product"):
                        return data["product"], source_name
            except (httpx.TimeoutException, httpx.RequestError):
                # cette base est en timeout/injoignable : on tente la suivante
                continue
    return None, None


NUTRIENT_LABELS = {
    "fat": "Matières grasses",
    "saturated-fat": "Acides gras saturés",
    "sugars": "Sucres",
    "salt": "Sel",
}


def _extract_nutrient_levels(product: dict) -> list[schemas.NutrientLevel]:
    """Construit la liste des repères nutritionnels (comme affichés sur
    Open Food Facts) à partir des champs nutrient_levels/nutriments bruts."""
    levels = product.get("nutrient_levels") or {}
    nutriments = product.get("nutriments") or {}
    result = []
    for key, label in NUTRIENT_LABELS.items():
        level = levels.get(key)
        value = nutriments.get(f"{key}_100g")
        if level is None and value is None:
            continue
        result.append(schemas.NutrientLevel(key=key, label=label, level=level, value_100g=value))
    return result


VALID_NUTRISCORE = {"a", "b", "c", "d", "e"}


@router.post("/products/{product_id}/refresh-off", response_model=schemas.ProductResponse)
async def refresh_product_from_off(
    product_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rafraîchit les données Open*Facts d'un produit existant (rattrapage
    pour les produits scannés avant l'ajout du Nutri-Score) : met à jour le
    nutriscore_grade, et complète l'image/la marque si elles sont vides.
    Nécessite que le produit ait un code-barres."""
    product = db.execute(
        select(models.Product)
        .where(models.Product.id == product_id, models.Product.user_id == current_user.id)
        .options(
            selectinload(models.Product.category),
            selectinload(models.Product.location),
            selectinload(models.Product.sub_category),
        )
    ).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail=PRODUCT_NOT_FOUND)
    if not product.barcode:
        raise HTTPException(status_code=400, detail="Ce produit n'a pas de code-barres : impossible d'interroger Open Food Facts")

    off_product, _source = await _fetch_off_product(product.barcode, fields=OFF_SIMPLE_FIELDS)
    if off_product is None:
        raise HTTPException(
            status_code=404,
            detail="Produit non trouvé sur les bases de données partenaires (Alimentaire, Animaux, Cosmétiques)",
        )

    raw_nutriscore = (off_product.get("nutriscore_grade") or "").lower()
    product.nutriscore_grade = raw_nutriscore if raw_nutriscore in VALID_NUTRISCORE else None

    # On complète uniquement les champs vides : pas d'écrasement des données
    # saisies/modifiées par l'utilisateur.
    if not product.image_url:
        product.image_url = off_product.get("image_url") or off_product.get("image_front_url")
    if not product.brand:
        product.brand = off_product.get("brands")

    product.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(product, attribute_names=["category", "location", "sub_category"])
    return _enrich_product(product)


@router.get("/barcode/{barcode}/full")
async def lookup_barcode_full(barcode: str):
    """
    Renvoie la fiche produit Open Food Facts complète et brute (utilisée par
    la fiche détail produit en mode "information complète"). Contrairement à
    /barcode/{barcode}, ne présélectionne rien côté StockHome : c'est un
    passe-plat direct de la réponse Open*Facts.
    """
    product, matched_source = await _fetch_off_product(barcode)
    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Produit non trouvé sur les bases de données partenaires (Alimentaire, Animaux, Cosmétiques)",
        )
    return {"source": matched_source, "product": product}


@router.get("/barcode/{barcode}", response_model=schemas.OpenFoodFactsProduct)
async def lookup_barcode(barcode: str):
    """
    Recherche d'informations produit sur les bases Open*Facts (appel HTTP
    externe, reste async). Interroge Open Food Facts, Open Beauty Facts puis
    Open Pet Food Facts dans l'ordre, s'arrête à la première réponse trouvée.
    """
    product, matched_source = await _fetch_off_product(barcode, fields=OFF_SIMPLE_FIELDS)

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

    # Nutri-Score : OFF renvoie 'a'..'e', ou parfois 'not-applicable'/'unknown'
    # pour les produits non alimentaires (Beauty/Pet Facts) -- on ne garde
    # que les valeurs a-e exploitables pour l'affichage.
    raw_nutriscore = (product.get("nutriscore_grade") or "").lower()
    nutriscore_grade = raw_nutriscore if raw_nutriscore in {"a", "b", "c", "d", "e"} else None

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
        nutriscore_grade=nutriscore_grade,
        nutrient_levels=_extract_nutrient_levels(product),
    )
