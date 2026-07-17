"""Définitions des modèles SQLAlchemy pour StockHome."""

# pylint: disable=too-few-public-methods, missing-class-docstring

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def gen_uuid() -> str:
    """Génère un identifiant UUID4 sous forme de chaîne."""
    return str(uuid.uuid4())


def utcnow() -> datetime:
    """Retourne l'horodatage UTC courant."""
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    # Prénom / Nom, facultatifs (renseignables depuis la page profil) --
    # username reste le login/identifiant d'affichage par défaut.
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=True)
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # "admin" ou "user". Seul un admin accède à la gestion des utilisateurs.
    role: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    # "pending" (en attente de validation par un admin), "active" ou "disabled".
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)

    categories: Mapped[list["Category"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    sub_categories: Mapped[list["SubCategory"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    locations: Mapped[list["StorageLocation"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    products: Mapped[list["Product"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    shopping_items: Mapped[list["ShoppingListItem"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    icon: Mapped[str] = mapped_column(String(50), default="Package")
    color: Mapped[str] = mapped_column(String(20), default="#3B82F6")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="categories")
    sub_categories: Mapped[list["SubCategory"]] = relationship(back_populates="category")
    products: Mapped[list["Product"]] = relationship(back_populates="category")


class SubCategory(Base):
    __tablename__ = "sub_categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Catégorie parente (optionnelle)
    category_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    min_quantity: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="sub_categories")
    category: Mapped["Category | None"] = relationship(back_populates="sub_categories")
    products: Mapped[list["Product"]] = relationship(back_populates="sub_category")


class StorageLocation(Base):
    __tablename__ = "storage_locations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(50), default="Home")
    color: Mapped[str] = mapped_column(String(20), default="#3B82F6")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="locations")
    products: Mapped[list["Product"]] = relationship(back_populates="location")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    barcode: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    min_quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit: Mapped[str] = mapped_column(String(30), default="unité")
    brand: Mapped[str | None] = mapped_column(String(150), nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Nutri-Score ('a' à 'e'), récupéré depuis Open Food Facts au moment du
    # scan et mis en cache ici pour un affichage rapide dans les listes
    # (évite un appel OFF par produit à chaque chargement de la page).
    nutriscore_grade: Mapped[str | None] = mapped_column(String(2), nullable=True)

    category_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    sub_category_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("sub_categories.id", ondelete="SET NULL"), nullable=True
    )
    location_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("storage_locations.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped["User"] = relationship(back_populates="products")
    category: Mapped["Category | None"] = relationship(back_populates="products")
    sub_category: Mapped["SubCategory | None"] = relationship(back_populates="products")
    location: Mapped["StorageLocation | None"] = relationship(back_populates="products")


class ShoppingListItem(Base):
    __tablename__ = "shopping_list"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit: Mapped[str] = mapped_column(String(30), default="unité")
    is_checked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="shopping_items")
