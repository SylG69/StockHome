from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user
from database import get_db

router = APIRouter(prefix="/api/shopping-list", tags=["shopping-list"])


@router.get("", response_model=list[schemas.ShoppingListItemResponse])
def get_shopping_list(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = db.execute(select(models.ShoppingListItem).where(models.ShoppingListItem.user_id == current_user.id))
    return result.scalars().all()


@router.get("/generate", response_model=list[schemas.ShoppingListItemResponse])
def generate_shopping_list(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Recalcule la liste de courses à partir des produits en stock bas
    (quantity < min_quantity), calculé à la volée -- pas de champ dénormalisé
    à resynchroniser (contrairement à l'ancienne version DynamoDB).
    """
    low_stock_products = db.execute(
        select(models.Product).where(
            models.Product.user_id == current_user.id,
            models.Product.quantity < models.Product.min_quantity,
        )
    ).scalars().all()

    # Nettoyage des anciens items auto-générés (liés à un produit)
    db.execute(
        delete(models.ShoppingListItem).where(
            models.ShoppingListItem.user_id == current_user.id,
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
            )
        )

    db.commit()

    result = db.execute(select(models.ShoppingListItem).where(models.ShoppingListItem.user_id == current_user.id))
    return result.scalars().all()


@router.post("", response_model=schemas.ShoppingListItemResponse)
def add_shopping_list_item(
    data: schemas.ShoppingListItemCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = models.ShoppingListItem(**data.model_dump(), user_id=current_user.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post("/bulk", response_model=list[schemas.ShoppingListItemResponse])
def add_shopping_list_items_bulk(
    items_data: list[schemas.ShoppingListItemCreate] = Body(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not items_data:
        return []
    items = [models.ShoppingListItem(**data.model_dump(), user_id=current_user.id) for data in items_data]
    db.add_all(items)
    db.commit()
    for item in items:
        db.refresh(item)
    return items


@router.patch("/{item_id}/toggle")
def toggle_shopping_list_item(
    item_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    item = db.execute(
        select(models.ShoppingListItem).where(
            models.ShoppingListItem.id == item_id, models.ShoppingListItem.user_id == current_user.id
        )
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    item.is_checked = not item.is_checked
    db.commit()
    return {"is_checked": item.is_checked}


@router.delete("/{item_id}")
def delete_shopping_list_item(
    item_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    item = db.execute(
        select(models.ShoppingListItem).where(
            models.ShoppingListItem.id == item_id, models.ShoppingListItem.user_id == current_user.id
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
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = delete(models.ShoppingListItem).where(models.ShoppingListItem.user_id == current_user.id)
    if checked_only:
        query = query.where(models.ShoppingListItem.is_checked.is_(True))
    db.execute(query)
    db.commit()
    return {"message": "Liste de courses vidée"}
