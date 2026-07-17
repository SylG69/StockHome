"""Points de terminaison du tableau de bord pour les statistiques agrégées
utilisées par l'interface StockHome."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user
from database import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
def get_dashboard_stats(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retourne les statistiques résumées pour le tableau de bord de l'utilisateur courant."""
    user_id = current_user.id

    total_products = db.execute(
        select(func.count(models.Product.id)).where(models.Product.user_id == user_id)  # pylint: disable=not-callable
    ).scalar_one()

    total_categories = db.execute(
        select(func.count(models.Category.id)).where(models.Category.user_id == user_id)  # pylint: disable=not-callable
    ).scalar_one()

    total_locations = db.execute(
        select(func.count(models.StorageLocation.id)).where(models.StorageLocation.user_id == user_id)  # pylint: disable=not-callable
    ).scalar_one()

    shopping_list_count = db.execute(
        select(func.count(models.ShoppingListItem.id)).where(  # pylint: disable=not-callable
            models.ShoppingListItem.user_id == user_id, models.ShoppingListItem.is_checked.is_(False)
        )
    ).scalar_one()

    by_category_rows = db.execute(
        select(models.Product.category_id, func.count()).where(models.Product.user_id == user_id).group_by(  # pylint: disable=not-callable
            models.Product.category_id
        )
    ).all()
    products_by_category = {(cat_id or "uncategorized"): count for cat_id, count in by_category_rows}

    recent_result = db.execute(
        select(models.Product)
        .where(models.Product.user_id == user_id)
        .order_by(models.Product.updated_at.desc())
        .limit(5)
    )
    recent_products = [schemas.ProductResponse.model_validate(p) for p in recent_result.scalars().all()]

    # Stock bas calculé par SOUS-CATÉGORIE (stock total des produits qui lui sont
    # rattachés, comparé à son seuil min_quantity)
    stock_by_subcategory = dict(
        db.execute(
            select(models.Product.sub_category_id, func.coalesce(func.sum(models.Product.quantity), 0))
            .where(models.Product.user_id == user_id, models.Product.sub_category_id.is_not(None))
            .group_by(models.Product.sub_category_id)
        ).all()
    )

    subcategories = db.execute(
        select(models.SubCategory).where(models.SubCategory.user_id == user_id)
    ).scalars().all()

    low_stock_subcategories = []
    for sub in subcategories:
        if not sub.min_quantity:
            continue  # pas de seuil défini pour cette sous-catégorie : rien à signaler
        total_stock = stock_by_subcategory.get(sub.id, 0)
        if total_stock < sub.min_quantity:
            low_stock_subcategories.append({
                "id": sub.id,
                "name": sub.name,
                "total_stock": total_stock,
                "threshold": sub.min_quantity,
            })
    low_stock_subcategories.sort(key=lambda s: s["name"])

    return {
        "total_products": total_products,
        "low_stock_count": len(low_stock_subcategories),
        "total_categories": total_categories,
        "total_locations": total_locations,
        "shopping_list_count": shopping_list_count,
        "products_by_category": products_by_category,
        "recent_products": recent_products,
        "low_stock_subcategories": low_stock_subcategories,
    }
