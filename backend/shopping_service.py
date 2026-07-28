"""Points de terminaison de la liste de courses pour StockHome."""

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_active_household, get_current_user
from database import get_db

router = APIRouter(prefix="/api/shopping-list", tags=["shopping-list"])


@router.get("", response_model=list[schemas.ShoppingListItemResponse])
def get_shopping_list(active_household: models.Household = Depends(get_active_household), db: Session = Depends(get_db)):
    """Renvoie les articles de la liste de courses du foyer actif de l'utilisateur courant."""
    result = db.execute(select(models.ShoppingListItem).where(models.ShoppingListItem.household_id == active_household.id))
    return result.scalars().all()


@router.get("/generate", response_model=list[schemas.ShoppingListItemResponse])
def generate_shopping_list(
    current_user: models.User = Depends(get_current_user),
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Recalcule la liste de courses à partir des produits en stock bas
    (quantity < min_quantity), calculée à la volée à chaque appel."""
    low_stock_products = db.execute(
        select(models.Product).where(
            models.Product.household_id == active_household.id,
            models.Product.quantity < models.Product.min_quantity,
        )
    ).scalars().all()

    # Nettoyage des anciens items auto-générés (liés à un produit)
    db.execute(
        delete(models.ShoppingListItem).where(
            models.ShoppingListItem.household_id == active_household.id,
            models.ShoppingListItem.product_id.is_not(None),
        )
    )

    for product in low_stock_products:
        quantity_needed = product.min_quantity - product.quantity
        db.add(
            models.ShoppingListItem(
                product_id=product.id,
                name=product.name,
                quantity=quantity_needed,
                unit=product.unit or "unité",
                user_id=current_user.id,
                household_id=active_household.id,
            )
        )

    db.commit()

    result = db.execute(select(models.ShoppingListItem).where(models.ShoppingListItem.household_id == active_household.id))
    return result.scalars().all()


@router.post("", response_model=schemas.ShoppingListItemResponse)
def add_shopping_list_item(
    data: schemas.ShoppingListItemCreate,
    current_user: models.User = Depends(get_current_user),
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Ajoute un article unique à la liste de courses du foyer actif."""
    item = models.ShoppingListItem(**data.model_dump(), user_id=current_user.id, household_id=active_household.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post("/bulk", response_model=list[schemas.ShoppingListItemResponse])
def add_shopping_list_items_bulk(
    items_data: list[schemas.ShoppingListItemCreate] = Body(...),
    current_user: models.User = Depends(get_current_user),
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Ajoute plusieurs articles à la liste de courses du foyer actif en une seule requête."""
    if not items_data:
        return []
    items = [
        models.ShoppingListItem(**data.model_dump(), user_id=current_user.id, household_id=active_household.id)
        for data in items_data
    ]
    db.add_all(items)
    db.commit()
    for item in items:
        db.refresh(item)
    return items


@router.patch("/{item_id}/toggle")
def toggle_shopping_list_item(
    item_id: str, active_household: models.Household = Depends(get_active_household), db: Session = Depends(get_db)
):
    """Bascule l'état coché d'un article de la liste de courses."""
    item = db.execute(
        select(models.ShoppingListItem).where(
            models.ShoppingListItem.id == item_id, models.ShoppingListItem.household_id == active_household.id
        )
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    item.is_checked = not item.is_checked
    db.commit()
    return {"is_checked": item.is_checked}


@router.delete("/{item_id}")
def delete_shopping_list_item(
    item_id: str, active_household: models.Household = Depends(get_active_household), db: Session = Depends(get_db)
):
    """Supprime un article de la liste de courses."""
    item = db.execute(
        select(models.ShoppingListItem).where(
            models.ShoppingListItem.id == item_id, models.ShoppingListItem.household_id == active_household.id
        )
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    db.delete(item)
    db.commit()
    return {"message": "Article supprimé"}


@router.delete("")
def clear_shopping_list(
    checked_only: bool = True,
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Supprime tous les articles de la liste de courses du foyer actif."""
    query = delete(models.ShoppingListItem).where(models.ShoppingListItem.household_id == active_household.id)
    if checked_only:
        query = query.where(models.ShoppingListItem.is_checked.is_(True))
    db.execute(query)
    db.commit()
    return {"message": "Liste de courses vidée"}
