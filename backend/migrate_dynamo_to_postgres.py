"""
Migration des données StockHome de DynamoDB vers PostgreSQL.

Prérequis :
    pip install boto3 sqlalchemy psycopg2-binary --break-system-packages
    Variables d'environnement AWS classiques (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
    AWS_REGION) ou un profil AWS CLI configuré, + DATABASE_URL pointant vers PostgreSQL.

Usage :
    python migrate_dynamo_to_postgres.py            # exécute la migration
    python migrate_dynamo_to_postgres.py --dry-run   # affiche ce qui serait migré, sans écrire

Notes de mapping (à vérifier avant de lancer en prod) :
  - Users : le hash de mot de passe existant (format "salt$sha256hex") est repris
    tel quel. auth.py sait le vérifier et le migre en bcrypt au premier login réussi.
  - ReferenceData (CAT#/LOC#/SUBCAT#) : le préfixe est retiré de l'id, le reste est
    conservé comme identifiant PostgreSQL (pas de UUID régénéré, pour ne pas casser
    les références product.category_id / sub_category_id / location_id).
  - StorageLocation.color : repris depuis DynamoDB si présent, sinon "#3B82F6" par défaut.
  - SubCategory -> catégorie parente : les services DynamoDB ne sont pas cohérents
    (config_service.py écrit un champ "sub_category_id", shopping_service.py lit un
    champ "parent_id"). On essaie category_id, puis parent_id, puis sub_category_id,
    dans cet ordre. Vérifiez le résultat après migration.
  - SubCategory.min_quantity : mappé depuis "min_stock" si présent, sinon "min_quantity".
  - Product.quantity/min_quantity : mappé depuis "quantity"/"min_quantity" (le nom
    utilisé par product_service.py). Le dashboard_service.py utilisait par erreur
    "current_stock"/"min_stock" qui n'étaient jamais écrits sur les produits -- ignorés.
  - ShoppingListItem.created_at : mappé depuis "added_at".
  - ShoppingListItem.quantity : DynamoDB stockait un float, converti en int (arrondi).
"""

import argparse
import os
from datetime import datetime, timezone

import boto3

from database import Base, SessionLocal, engine
from models import Category, Product, ShoppingListItem, StorageLocation, SubCategory, User

REGION = os.environ.get("AWS_REGION", "eu-west-3")
USERS_TABLE = os.environ.get("USERS_TABLE", "StockHome-Users")
REF_TABLE = os.environ.get("REF_TABLE", "StockHome-ReferenceData")
PRODUCTS_TABLE = os.environ.get("PRODUCTS_TABLE", "StockHome-Products")
SHOPPING_TABLE = os.environ.get("SHOPPING_TABLE", "StockHome-ShoppingList")


def scan_all(table):
    items = []
    resp = table.scan()
    items.extend(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    return items


def parse_dt(value, default=None):
    if not value:
        return default or datetime.now(timezone.utc)
    try:
        return datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return default or datetime.now(timezone.utc)


def strip_prefix(dynamo_id: str, prefix: str) -> str:
    return dynamo_id[len(prefix):] if dynamo_id.startswith(prefix) else dynamo_id


def migrate(dry_run: bool = False):
    dynamodb = boto3.resource("dynamodb", region_name=REGION)

    users_raw = scan_all(dynamodb.Table(USERS_TABLE))
    ref_raw = scan_all(dynamodb.Table(REF_TABLE))
    products_raw = scan_all(dynamodb.Table(PRODUCTS_TABLE))
    shopping_raw = scan_all(dynamodb.Table(SHOPPING_TABLE))

    categories_raw = [i for i in ref_raw if i["id"].startswith("CAT#")]
    locations_raw = [i for i in ref_raw if i["id"].startswith("LOC#")]
    subcategories_raw = [i for i in ref_raw if i["id"].startswith("SUBCAT#")]

    print(f"Trouvé : {len(users_raw)} users, {len(categories_raw)} catégories, "
          f"{len(locations_raw)} emplacements, {len(subcategories_raw)} sous-catégories, "
          f"{len(products_raw)} produits, {len(shopping_raw)} articles de courses.")

    if dry_run:
        print("--dry-run : aucune écriture effectuée.")
        return

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        for u in users_raw:
            db.add(User(
                id=u["id"],
                email=u["email"],
                username=u.get("username", u["email"].split("@")[0]),
                password_hash=u["password"],
                created_at=parse_dt(u.get("created_at")),
            ))

        for c in categories_raw:
            db.add(Category(
                id=strip_prefix(c["id"], "CAT#"),
                user_id=c["user_id"],
                name=c.get("name", "Sans nom"),
                icon=c.get("icon") or "Package",
                color=c.get("color") or "#3B82F6",
                created_at=parse_dt(c.get("created_at")),
            ))

        for loc in locations_raw:
            db.add(StorageLocation(
                id=strip_prefix(loc["id"], "LOC#"),
                user_id=loc["user_id"],
                name=loc.get("name", "Sans nom"),
                description=loc.get("description") or "",
                icon=loc.get("icon") or "Home",
                color=loc.get("color") or "#3B82F6",
                created_at=parse_dt(loc.get("created_at")),
            ))

        for sub in subcategories_raw:
            category_id = sub.get("category_id") or sub.get("parent_id") or sub.get("sub_category_id")
            if category_id:
                category_id = strip_prefix(category_id, "CAT#")
            db.add(SubCategory(
                id=strip_prefix(sub["id"], "SUBCAT#"),
                user_id=sub["user_id"],
                category_id=category_id,
                name=sub.get("name", "Sans nom"),
                min_quantity=int(sub.get("min_stock", sub.get("min_quantity", 0)) or 0),
                created_at=parse_dt(sub.get("created_at")),
            ))

        db.flush()  # s'assure que catégories/sous-catégories/emplacements existent avant les produits

        for p in products_raw:
            category_id = p.get("category_id")
            sub_category_id = p.get("sub_category_id")
            location_id = p.get("location_id")
            db.add(Product(
                id=p["id"],
                user_id=p["user_id"],
                name=p.get("name", "Sans nom"),
                description=p.get("description") or "",
                barcode=p.get("barcode"),
                quantity=int(p.get("quantity", 0) or 0),
                min_quantity=int(p.get("min_quantity", 1) or 1),
                unit=p.get("unit") or "unité",
                brand=p.get("brand"),
                image_url=p.get("image_url"),
                category_id=strip_prefix(category_id, "CAT#") if category_id else None,
                sub_category_id=strip_prefix(sub_category_id, "SUBCAT#") if sub_category_id else None,
                location_id=strip_prefix(location_id, "LOC#") if location_id else None,
                created_at=parse_dt(p.get("created_at")),
                updated_at=parse_dt(p.get("updated_at"), default=parse_dt(p.get("created_at"))),
            ))

        db.flush()

        for item in shopping_raw:
            db.add(ShoppingListItem(
                id=item["id"],
                user_id=item["user_id"],
                product_id=item.get("product_id"),
                name=item.get("name", "Sans nom"),
                quantity=round(float(item.get("quantity", 1) or 1)),
                unit=item.get("unit") or "unité",
                is_checked=bool(item.get("is_checked", False)),
                created_at=parse_dt(item.get("added_at")),
            ))

        db.commit()
        print("Migration terminée.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    migrate(dry_run=args.dry_run)
