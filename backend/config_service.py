"""Points de terminaison de configuration pour StockHome."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user
from database import get_db

router = APIRouter(prefix="/api", tags=["config"])


# ==================== CATEGORIES ====================

@router.get("/categories", response_model=list[schemas.CategoryResponse])
def get_categories(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Renvoie toutes les catégories appartenant à l'utilisateur authentifié."""
    result = db.execute(select(models.Category).where(models.Category.user_id == current_user.id))
    return result.scalars().all()


@router.post("/categories", response_model=schemas.CategoryResponse)
def create_category(
    data: schemas.CategoryCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crée une nouvelle catégorie pour l'utilisateur authentifié."""
    category = models.Category(**data.model_dump(), user_id=current_user.id)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.put("/categories/{category_id}", response_model=schemas.CategoryResponse)
def update_category(
    category_id: str,
    data: schemas.CategoryCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Met à jour une catégorie existante appartenant à l'utilisateur authentifié."""
    category = db.execute(
        select(models.Category).where(models.Category.id == category_id, models.Category.user_id == current_user.id)
    ).scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée")
    for key, value in data.model_dump().items():
        setattr(category, key, value)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}")
def delete_category(
    category_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Supprime une catégorie appartenant à l'utilisateur authentifié."""
    category = db.execute(
        select(models.Category).where(models.Category.id == category_id, models.Category.user_id == current_user.id)
    ).scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée")
    db.delete(category)  # les produits liés passent à category_id=NULL via ON DELETE SET NULL
    db.commit()
    return {"message": "Catégorie supprimée"}


# ==================== SUB-CATEGORIES ====================

@router.get("/subcategories", response_model=list[schemas.SubCategoryResponse])
def get_subcategories(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Renvoie toutes les sous-catégories pour l'utilisateur authentifié."""
    result = db.execute(select(models.SubCategory).where(models.SubCategory.user_id == current_user.id))
    return result.scalars().all()


@router.post("/subcategories", response_model=schemas.SubCategoryResponse)
def create_subcategory(
    data: schemas.SubCategoryCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crée une nouvelle sous-catégorie pour l'utilisateur authentifié."""
    sub_category = models.SubCategory(**data.model_dump(), user_id=current_user.id)
    db.add(sub_category)
    db.commit()
    db.refresh(sub_category)
    return sub_category


@router.put("/subcategories/{sub_category_id}", response_model=schemas.SubCategoryResponse)
def update_subcategory(
    sub_category_id: str,
    data: schemas.SubCategoryCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Met à jour une sous-catégorie existante pour l'utilisateur authentifié.

    Fusion automatique : si le nouveau nom correspond (insensible à la casse)
    à une AUTRE sous-catégorie déjà existante, on ne crée pas de doublon --
    tous les produits de la sous-catégorie renommée sont rattachés à la
    sous-catégorie existante, qui est conservée (avec sa propre config), et
    celle qu'on renommait est supprimée."""
    sub_category = db.execute(
        select(models.SubCategory).where(
            models.SubCategory.id == sub_category_id, models.SubCategory.user_id == current_user.id
        )
    ).scalar_one_or_none()
    if not sub_category:
        raise HTTPException(status_code=404, detail="Sous-catégorie non trouvée")

    new_name = data.name.strip()
    existing_match = db.execute(
        select(models.SubCategory).where(
            models.SubCategory.user_id == current_user.id,
            models.SubCategory.id != sub_category_id,
            func.lower(models.SubCategory.name) == new_name.lower(),
        )
    ).scalar_one_or_none()

    if existing_match:
        db.execute(
            models.Product.__table__.update()
            .where(models.Product.sub_category_id == sub_category_id)
            .values(sub_category_id=existing_match.id)
        )
        db.delete(sub_category)
        db.commit()
        db.refresh(existing_match)
        return existing_match

    for key, value in data.model_dump().items():
        setattr(sub_category, key, value)
    db.commit()
    db.refresh(sub_category)
    return sub_category


@router.patch("/subcategories/{sub_category_id}/threshold", response_model=schemas.SubCategoryResponse)
def update_subcategory_threshold(
    sub_category_id: str,
    data: schemas.SubCategoryUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Met à jour uniquement le seuil d'une sous-catégorie pour l'utilisateur authentifié."""
    sub_category = db.execute(
        select(models.SubCategory).where(
            models.SubCategory.id == sub_category_id, models.SubCategory.user_id == current_user.id
        )
    ).scalar_one_or_none()
    if not sub_category:
        raise HTTPException(status_code=404, detail="Sous-catégorie non trouvée")
    if data.min_quantity is not None:
        sub_category.min_quantity = data.min_quantity
    db.commit()
    db.refresh(sub_category)
    return sub_category


@router.delete("/subcategories/{sub_category_id}")
def delete_subcategory(
    sub_category_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Supprime une sous-catégorie appartenant à l'utilisateur authentifié."""
    sub_category = db.execute(
        select(models.SubCategory).where(
            models.SubCategory.id == sub_category_id, models.SubCategory.user_id == current_user.id
        )
    ).scalar_one_or_none()
    if not sub_category:
        raise HTTPException(status_code=404, detail="Sous-catégorie non trouvée")
    db.delete(sub_category)
    db.commit()
    return {"message": "Sous-catégorie supprimée"}


# ==================== STORAGE LOCATIONS ====================

@router.get("/locations", response_model=list[schemas.StorageLocationResponse])
def get_locations(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Renvoie tous les emplacements de stockage pour l'utilisateur authentifié."""
    result = db.execute(select(models.StorageLocation).where(models.StorageLocation.user_id == current_user.id))
    return result.scalars().all()


@router.post("/locations", response_model=schemas.StorageLocationResponse)
def create_location(
    data: schemas.StorageLocationCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crée un nouvel emplacement de stockage pour l'utilisateur authentifié."""
    location = models.StorageLocation(**data.model_dump(), user_id=current_user.id)
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


@router.put("/locations/{location_id}", response_model=schemas.StorageLocationResponse)
def update_location(
    location_id: str,
    data: schemas.StorageLocationCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Met à jour un emplacement de stockage existant pour l'utilisateur authentifié."""
    location = db.execute(
        select(models.StorageLocation).where(
            models.StorageLocation.id == location_id, models.StorageLocation.user_id == current_user.id
        )
    ).scalar_one_or_none()
    if not location:
        raise HTTPException(status_code=404, detail="Emplacement non trouvé")
    for key, value in data.model_dump().items():
        setattr(location, key, value)
    db.commit()
    db.refresh(location)
    return location


@router.delete("/locations/{location_id}")
def delete_location(
    location_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Supprime un emplacement de stockage appartenant à l'utilisateur authentifié."""
    location = db.execute(
        select(models.StorageLocation).where(
            models.StorageLocation.id == location_id, models.StorageLocation.user_id == current_user.id
        )
    ).scalar_one_or_none()
    if not location:
        raise HTTPException(status_code=404, detail="Emplacement non trouvé")
    db.delete(location)
    db.commit()
    return {"message": "Emplacement supprimé"}
