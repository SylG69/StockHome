"""Définitions des modèles SQLAlchemy pour StockHome."""

# pylint: disable=too-few-public-methods

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def gen_uuid() -> str:
    """Génère un identifiant UUID4 sous forme de chaîne."""
    return str(uuid.uuid4())


def utcnow() -> datetime:
    """Retourne l'horodatage UTC courant."""
    return datetime.now(timezone.utc)


class User(Base):
    """Compte utilisateur (identifiants, rôle, foyer actif/préféré)."""

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
    github_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # "admin" ou "user". Seul un admin accède à la gestion des utilisateurs.
    role: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    # "pending" (en attente de validation par un admin), "active" ou "disabled".
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)

    # Foyer actuellement actif : détermine sur quel stock partagé portent les
    # opérations de l'utilisateur (produits, catégories, liste de courses...).
    # Chaque utilisateur possède toujours un foyer personnel (is_personal=True)
    # et peut rejoindre d'autres foyers partagés via un code d'invitation.
    active_household_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("households.id", ondelete="SET NULL"), nullable=True
    )
    # Foyer préféré, choisi depuis la page profil : si auto_switch_to_preferred
    # est activé, ce foyer devient automatiquement le foyer actif à chaque
    # connexion (voir auth_service.apply_preferred_household_if_enabled).
    preferred_household_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("households.id", ondelete="SET NULL"), nullable=True
    )
    auto_switch_to_preferred: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    categories: Mapped[list["Category"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    sub_categories: Mapped[list["SubCategory"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    locations: Mapped[list["StorageLocation"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    products: Mapped[list["Product"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    shopping_items: Mapped[list["ShoppingListItem"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    household_memberships: Mapped[list["HouseholdMember"]] = relationship(
        back_populates="user", foreign_keys="HouseholdMember.user_id", cascade="all, delete-orphan"
    )
    active_household: Mapped["Household | None"] = relationship(foreign_keys=[active_household_id])

    @property
    def auth_methods(self) -> list[str]:
        """Liste des méthodes de connexion actives pour ce compte. Un compte
        peut cumuler plusieurs méthodes (ex: inscrit par email puis lié à
        Google ensuite). Pour ajouter un futur SSO (GitHub, Apple...) :
        ajouter la colonne d'identifiant correspondante (ex. github_id) au
        modèle, puis un test ici -- rien d'autre à changer, le schéma et le
        frontend affichent déjà dynamiquement cette liste."""
        methods = []
        if self.password_hash:
            methods.append("email")
        if self.google_id:
            methods.append("google")
        if self.github_id:
            methods.append("github")
        return methods


class Household(Base):
    """Foyer (personnel ou partagé) : regroupe le stock et les membres qui y accèdent."""

    __tablename__ = "households"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # Foyer personnel créé automatiquement pour chaque utilisateur (à
    # l'inscription, ou rétroactivement via la migration de backfill) :
    # toujours un seul membre (son propriétaire, rôle admin), jamais
    # rejoignable/quittable/gérable via les endpoints de partage.
    is_personal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Code d'invitation permettant de rejoindre ce foyer ; toujours NULL pour
    # un foyer personnel.
    invite_code: Mapped[str | None] = mapped_column(String(16), unique=True, nullable=True, index=True)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Jour de la semaine (ISO 1=lundi..7=dimanche) où la récapitulation des
    # récompenses des corvées redémarre pour ce foyer -- configurable par un
    # admin du foyer (voir chore_service._period_start). Dimanche par défaut.
    rewards_summary_weekday: Mapped[int] = mapped_column(Integer, default=7, nullable=False)
    # Permet à un admin de désactiver entièrement la fonctionnalité récompenses
    # pour ce foyer (masque les champs/actions côté frontend).
    rewards_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    members: Mapped[list["HouseholdMember"]] = relationship(
        back_populates="household", foreign_keys="HouseholdMember.household_id", cascade="all, delete-orphan"
    )
    categories: Mapped[list["Category"]] = relationship(back_populates="household", cascade="all, delete-orphan")
    sub_categories: Mapped[list["SubCategory"]] = relationship(back_populates="household", cascade="all, delete-orphan")
    locations: Mapped[list["StorageLocation"]] = relationship(back_populates="household", cascade="all, delete-orphan")
    products: Mapped[list["Product"]] = relationship(back_populates="household", cascade="all, delete-orphan")
    shopping_items: Mapped[list["ShoppingListItem"]] = relationship(back_populates="household", cascade="all, delete-orphan")


class HouseholdMember(Base):
    """Table d'association : adhésion d'un utilisateur à un foyer, avec son rôle."""

    __tablename__ = "household_members"
    __table_args__ = (UniqueConstraint("household_id", "user_id", name="uq_household_members_household_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    household_id: Mapped[str] = mapped_column(String(36), ForeignKey("households.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # "admin" ou "member". Un foyer doit toujours conserver au moins un admin
    # (voir la règle appliquée dans household_service.leave_household).
    role: Mapped[str] = mapped_column(String(20), default="member", nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    household: Mapped["Household"] = relationship(back_populates="members", foreign_keys=[household_id])
    user: Mapped["User"] = relationship(back_populates="household_memberships", foreign_keys=[user_id])


class Category(Base):
    """Catégorie de produits (ex: Alimentaire, Hygiène), propre à un foyer."""

    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    # Créateur d'origine (provenance/audit) -- le partage effectif se fait via household_id.
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    household_id: Mapped[str] = mapped_column(String(36), ForeignKey("households.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    icon: Mapped[str] = mapped_column(String(50), default="Package")
    color: Mapped[str] = mapped_column(String(20), default="#3B82F6")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="categories")
    household: Mapped["Household"] = relationship(back_populates="categories")
    sub_categories: Mapped[list["SubCategory"]] = relationship(back_populates="category")
    products: Mapped[list["Product"]] = relationship(back_populates="category")


class SubCategory(Base):
    """Sous-catégorie de produits, avec son propre seuil de stock minimal."""

    __tablename__ = "sub_categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    household_id: Mapped[str] = mapped_column(String(36), ForeignKey("households.id", ondelete="CASCADE"), index=True)
    # Catégorie parente (optionnelle)
    category_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    min_quantity: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="sub_categories")
    household: Mapped["Household"] = relationship(back_populates="sub_categories")
    category: Mapped["Category | None"] = relationship(back_populates="sub_categories")
    products: Mapped[list["Product"]] = relationship(back_populates="sub_category")


class StorageLocation(Base):
    """Emplacement de stockage physique (ex: Cuisine, Garage), propre à un foyer."""

    __tablename__ = "storage_locations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    household_id: Mapped[str] = mapped_column(String(36), ForeignKey("households.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(50), default="Home")
    color: Mapped[str] = mapped_column(String(20), default="#3B82F6")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="locations")
    household: Mapped["Household"] = relationship(back_populates="locations")
    products: Mapped[list["Product"]] = relationship(back_populates="location")


class Product(Base):
    """Un lot de produit en stock (quantité, péremption, prix, données Open*Facts)."""

    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    household_id: Mapped[str] = mapped_column(String(36), ForeignKey("households.id", ondelete="CASCADE"), index=True)
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
    # Prix unitaire (EUR), librement modifiable par l'utilisateur. Prérempli
    # au scan avec le prix moyen Open Prices si disponible, mais jamais
    # écrasé automatiquement ensuite (voir refresh_product_from_off).
    price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    # Date de péremption (DLC/DLUO), saisie manuellement par l'utilisateur --
    # propre à l'exemplaire acheté, jamais déduite d'Open Food Facts (la base
    # décrit le produit générique, pas le lot précis en stock chez soi).
    expiration_date: Mapped[date | None] = mapped_column(Date, nullable=True)

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
    household: Mapped["Household"] = relationship(back_populates="products")
    category: Mapped["Category | None"] = relationship(back_populates="products")
    sub_category: Mapped["SubCategory | None"] = relationship(back_populates="products")
    location: Mapped["StorageLocation | None"] = relationship(back_populates="products")


class ShoppingListItem(Base):
    """Item de la liste de courses d'un foyer (éventuellement lié à un produit existant)."""

    __tablename__ = "shopping_list"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    household_id: Mapped[str] = mapped_column(String(36), ForeignKey("households.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit: Mapped[str] = mapped_column(String(30), default="unité")
    is_checked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="shopping_items")
    household: Mapped["Household"] = relationship(back_populates="shopping_items")


class Chore(Base):
    """Corvée récurrente du foyer : planification, attribution et récompense éventuelle."""

    __tablename__ = "chores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    household_id: Mapped[str] = mapped_column(String(36), ForeignKey("households.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")

    # "hourly" | "daily" | "weekly" | "biweekly" | "monthly" | "yearly" | "manually".
    period_type: Mapped[str] = mapped_column(String(20), default="manually", nullable=False)
    period_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)  # hourly
    # daily ("sans dérive", recalculé depuis last_done_at)
    period_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # weekly/biweekly, ex "1,3,5" (ISO 1=lundi..7=dimanche)
    weekdays: Mapped[str | None] = mapped_column(String(20), nullable=True)
    month_days: Mapped[str | None] = mapped_column(String(100), nullable=True)  # monthly, ex "1,15,28"
    yearly_month: Mapped[int | None] = mapped_column(Integer, nullable=True)  # yearly, 1-12
    yearly_day: Mapped[int | None] = mapped_column(Integer, nullable=True)  # yearly, 1-31
    # Heure d'échéance souhaitée ("HH:MM"), appliquée à chaque recalcul de
    # next_due_at (sauf pour "hourly"/"manually", où elle n'a pas de sens) --
    # sans elle, l'heure suit simplement celle de la dernière exécution.
    due_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    # Montant (EUR) versé au membre qui effectue cette corvée, si définie.
    reward: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    # "no-assignment" | "in-alphabetical-order" | "random" | "who-least-did-first".
    assignment_type: Mapped[str] = mapped_column(String(30), default="no-assignment", nullable=False)
    assigned_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Restreint la rotation (alphabétique/aléatoire/qui l'a le moins fait) à
    # ce sous-ensemble de membres du foyer, CSV d'user_id -- NULL/vide =
    # tous les membres actuels sont éligibles (comportement historique).
    eligible_user_ids: Mapped[str | None] = mapped_column(Text, nullable=True)

    last_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Si renseignée et dans le futur, la corvée s'affiche "terminée" (statut
    # "done") jusqu'à cette date -- correspond à l'échéance qui était en
    # cours au moment du dernier "marquer fait" (voir chore_service.execute_chore).
    # Devient automatiquement obsolète (ignorée) une fois cette date passée.
    done_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    household: Mapped["Household"] = relationship()
    assigned_user: Mapped["User | None"] = relationship(foreign_keys=[assigned_user_id])
    logs: Mapped[list["ChoreLog"]] = relationship(back_populates="chore", cascade="all, delete-orphan")


class ChoreLog(Base):
    """Entrée de journal : une exécution effective d'une corvée, avec l'état avant/après pour permettre l'undo."""

    __tablename__ = "chore_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    chore_id: Mapped[str] = mapped_column(String(36), ForeignKey("chores.id", ondelete="CASCADE"), index=True)
    household_id: Mapped[str] = mapped_column(String(36), ForeignKey("households.id", ondelete="CASCADE"), index=True)
    executed_by_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # État avant/après exécution, capturé au moment du "marquer fait" -- permet
    # un undo exact depuis le journal sans avoir à recalculer/deviner l'état
    # précédent (voir chore_service.undo_chore_log).
    previous_due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    previous_assigned_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    previous_done_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    new_due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Copie de Chore.reward au moment de l'exécution : le montant gagné reste
    # exact même si la récompense de la corvée change ensuite. NULL si la
    # corvée n'avait pas de récompense définie à cet instant.
    reward_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    # True si cette entrée correspond à un "passer" (échéance décalée sans
    # exécution réelle) plutôt qu'un "marquer fait" -- exclu du comptage
    # who-least-did-first et ne rapporte jamais de récompense.
    skipped: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    chore: Mapped["Chore"] = relationship(back_populates="logs")
    executed_by: Mapped["User | None"] = relationship(foreign_keys=[executed_by_user_id])
