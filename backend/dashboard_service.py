from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

"""Dashboard endpoints for aggregated statistics used by the StockHome UI."""

import models
import schemas
from auth import get_current_user
from database import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
def get_dashboard_stats(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return summary statistics for the current user dashboard."""
    user_id = current_user.id

    total_products = db.execute(
        select(func.count(models.Product.id)).where(models.Product.user_id == user_id)
    ).scalar_one()

    low_stock_count = db.execute(
        select(func.count(models.Product.id)).select_from(models.Product).where(
            models.Product.user_id == user_id, models.Product.quantity < models.Product.min_quantity
        )
    ).scalar_one()

    total_categories = db.execute(
        select(func.count(models.Category.id)).where(models.Category.user_id == user_id)
    ).scalar_one()

    total_locations = db.execute(
        select(func.count(models.StorageLocation.id)).where(models.StorageLocation.user_id == user_id)
    ).scalar_one()

    shopping_list_count = db.execute(
        select(func.count(models.ShoppingListItem.id)).where(
            models.ShoppingListItem.user_id == user_id, models.ShoppingListItem.is_checked.is_(False)
        )
    ).scalar_one()

    by_category_rows = db.execute(
        select(models.Product.category_id, func.count()).where(models.Product.user_id == user_id).group_by(
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

    return {
        "total_products": total_products,
        "low_stock_count": low_stock_count,
        "total_categories": total_categories,
        "total_locations": total_locations,
        "shopping_list_count": shopping_list_count,
        "products_by_category": products_by_category,
        "recent_products": recent_products,
    }
