"""Définitions des schémas Pydantic pour les requêtes et réponses de l'API StockHome."""

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr

# ==================== USERS ====================

class UserRegister(BaseModel):
    """Données pour l'inscription d'un utilisateur."""
    email: EmailStr
    username: str
    password: str

class UserLogin(BaseModel):
    """Données pour la connexion d'un utilisateur (email + mot de passe)."""
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    """Représentation publique d'un utilisateur renvoyée par l'API."""
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: EmailStr
    username: str
    created_at: datetime
    role: str = "user"
    status: str = "pending"
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    auth_methods: List[str] = []  # ex: ["email"], ["google"], ["email", "google"]
    active_household_id: Optional[str] = None
    preferred_household_id: Optional[str] = None
    auto_switch_to_preferred: bool = False

class UserStatusUpdate(BaseModel):
    """Requête admin pour approuver/refuser/désactiver un compte."""
    status: str  # "pending" | "active" | "disabled"

class UserRoleUpdate(BaseModel):
    """Requête admin pour changer le rôle d'un utilisateur."""
    role: str  # "admin" | "user"

class ProfileUpdate(BaseModel):
    """Requête self-service pour mettre à jour son propre profil."""
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    current_password: Optional[str] = None  # requis si new_password est fourni et qu'un mot de passe existe déjà
    new_password: Optional[str] = None
    preferred_household_id: Optional[str] = None  # foyer préféré ; "" pour l'effacer
    auto_switch_to_preferred: Optional[bool] = None

class TokenResponse(BaseModel):
    """Payload contenant le jeton d'accès et l'utilisateur associé."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class GoogleTokenBody(BaseModel):
    """Modèle pour la réception d'un jeton JWT côté serveur (ex: Google OAuth)."""
    token: str

class GithubTokenBody(BaseModel):
    """Code d'autorisation OAuth GitHub (flux "authorization code"), reçu
    par le frontend sur sa page de callback puis transmis ici pour être
    échangé contre un access_token GitHub côté serveur (le client_secret ne
    doit jamais transiter côté frontend)."""
    code: str

# ==================== HOUSEHOLDS ====================

class HouseholdCreate(BaseModel):
    """Requête de création d'un foyer partagé."""
    name: str
    # Si True, précrée les catégories et emplacements par défaut (les mêmes
    # que ceux proposés à l'inscription) pour éviter de repartir de zéro.
    create_defaults: bool = False

class HouseholdJoinRequest(BaseModel):
    """Requête pour rejoindre un foyer via son code d'invitation."""
    invite_code: str

class HouseholdSwitchRequest(BaseModel):
    """Requête pour changer le foyer actif de l'utilisateur courant."""
    household_id: str

class HouseholdMemberResponse(BaseModel):
    """Réponse API décrivant un membre d'un foyer."""
    model_config = ConfigDict(from_attributes=True)
    user_id: str
    username: str
    role: str
    joined_at: datetime

class HouseholdResponse(BaseModel):
    """Réponse API résumant un foyer du point de vue de l'utilisateur courant."""
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    is_personal: bool
    role: str  # rôle de l'utilisateur courant dans ce foyer
    member_count: int
    is_active: bool  # ce foyer est-il le foyer actif de l'utilisateur courant
    rewards_summary_weekday: int = 7  # ISO 1 (lundi) à 7 (dimanche)
    rewards_enabled: bool = True
    chores_enabled: bool = True
    loan_book_duration_days: int = 21
    loan_game_duration_days: int = 14
    loans_enabled: bool = True

class HouseholdDetailResponse(HouseholdResponse):
    """Détail d'un foyer, avec code d'invitation (admin uniquement) et membres."""
    invite_code: Optional[str] = None
    members: List[HouseholdMemberResponse] = []

# ==================== CATEGORIES ====================

class CategoryBase(BaseModel):
    """Base décrivant une catégorie (nom, icône, couleur)."""
    name: str
    icon: Optional[str] = "Package"
    color: Optional[str] = "#3B82F6"

class CategoryCreate(CategoryBase):
    """Requête de création d'une catégorie."""
    pass

class CategoryResponse(CategoryBase):
    """Réponse API pour une catégorie, inclut métadonnées et propriétaire."""
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    created_at: datetime

# ==================== SUB-CATEGORIES ====================

class SubCategoryBase(BaseModel):
    """Base décrivant une sous-catégorie et son seuil minimal."""
    name: str
    category_id: Optional[str] = None
    min_quantity: int = 0

class SubCategoryCreate(SubCategoryBase):
    """Requête de création d'une sous-catégorie."""
    pass

class SubCategoryUpdate(BaseModel):
    """Modèle de mise à jour partielle d'une sous-catégorie."""
    name: Optional[str] = None
    category_id: Optional[str] = None
    min_quantity: Optional[int] = None

class SubCategoryResponse(SubCategoryBase):
    """Réponse API pour une sous-catégorie, inclut métadonnées et propriétaire."""
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    created_at: datetime

# ==================== STORAGE LOCATIONS ====================

class StorageLocationBase(BaseModel):
    """Base décrivant un emplacement de stockage (nom, description, icône)."""
    name: str
    description: Optional[str] = ""
    icon: Optional[str] = "Home"
    color: Optional[str] = "#3B82F6"

class StorageLocationCreate(StorageLocationBase):
    """Requête de création d'un emplacement de stockage."""
    pass

class StorageLocationResponse(StorageLocationBase):
    """Réponse API pour un emplacement de stockage avec métadonnées."""
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    created_at: datetime

# ==================== PRODUCTS ====================

class ProductBase(BaseModel):
    """Base décrivant les champs communs d'un produit."""
    name: str
    description: Optional[str] = ""
    barcode: Optional[str] = None
    quantity: int = 0
    min_quantity: int = 1
    unit: Optional[str] = "unité"
    category_id: Optional[str] = None
    sub_category_id: Optional[str] = None
    location_id: Optional[str] = None
    image_url: Optional[str] = None
    brand: Optional[str] = None
    nutriscore_grade: Optional[str] = None  # 'a' à 'e', renseigné automatiquement via l'API OFF au scan
    price: Optional[float] = None  # prix unitaire (EUR), librement saisi/modifié par l'utilisateur
    expiration_date: Optional[date] = None  # DLC/DLUO, saisie manuelle uniquement

class ProductCreate(ProductBase):
    """Requête de création d'un produit; peut contenir un nom de sous-catégorie."""
    sub_category_name: Optional[str] = None  # création à la volée d'une sous-catégorie

class ProductUpdate(BaseModel):
    """Modèle de mise à jour partielle d'un produit (champs optionnels)."""
    name: Optional[str] = None
    description: Optional[str] = None
    barcode: Optional[str] = None
    quantity: Optional[int] = None
    min_quantity: Optional[int] = None
    unit: Optional[str] = None
    category_id: Optional[str] = None
    sub_category_id: Optional[str] = None
    sub_category_name: Optional[str] = None  # création à la volée d'une sous-catégorie
    location_id: Optional[str] = None
    image_url: Optional[str] = None
    brand: Optional[str] = None
    nutriscore_grade: Optional[str] = None
    price: Optional[float] = None
    expiration_date: Optional[date] = None

class ProductResponse(ProductBase):
    """Réponse API pour un produit, inclut métadonnées et noms résolus."""
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime
    category_name: Optional[str] = None
    location_name: Optional[str] = None
    sub_category_name: Optional[str] = None

# ==================== SHOPPING LIST ====================

class ShoppingListItemBase(BaseModel):
    """Base décrivant un item de liste de courses."""
    product_id: Optional[str] = None
    name: str
    quantity: int = 1
    unit: Optional[str] = "unité"
    is_checked: bool = False

class ShoppingListItemCreate(ShoppingListItemBase):
    """Requête pour ajouter un item à la liste de courses."""
    pass

class ShoppingListItemResponse(ShoppingListItemBase):
    """Réponse API pour un item de liste de courses, avec métadonnées."""
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    created_at: datetime

# ==================== OPEN FOOD FACTS ====================

class NutrientLevel(BaseModel):
    """Un repère nutritionnel individuel (ex: matières grasses), au format
    affiché par Open Food Facts : nom, niveau (faible/modéré/élevé) et
    valeur pour 100g/100ml."""
    key: str  # "fat" | "saturated-fat" | "sugars" | "salt"
    label: str  # libellé FR, ex: "Matières grasses"
    level: Optional[str] = None  # "low" | "moderate" | "high"
    value_100g: Optional[float] = None
    unit: str = "g"

class OpenFoodFactsProduct(BaseModel):
    """Modèle de suggestion produit basé sur les réponses Open*Facts."""
    barcode: str
    name: Optional[str] = None
    brand: Optional[str] = None
    image_url: Optional[str] = None
    categories: Optional[str] = None
    sub_categories_suggestions: List[str] = []
    quantity_info: Optional[str] = None
    source: Optional[str] = None
    # Présélections déduites côté serveur, à partir de la base qui a répondu
    # et des tags de catégorie. Purement indicatif : l'utilisateur reste
    # libre de tout changer dans le formulaire.
    suggested_category: Optional[str] = None  # ex: "Alimentaire", "Hygiène", "Animaux"
    needs_refrigeration: bool = False
    # Nutri-Score ('a' à 'e'), None si non applicable/inconnu (ex: produits
    # non alimentaires venant d'Open Beauty/Pet Food Facts).
    nutriscore_grade: Optional[str] = None
    nutrient_levels: List[NutrientLevel] = []
    # Prix moyen constaté sur Open Prices (openfoodfacts.org) pour ce
    # code-barres, en pure indication -- None si aucune donnée disponible.
    # Le champ prix du produit reste toujours libre à la saisie/modification.
    suggested_price: Optional[float] = None
    suggested_price_currency: Optional[str] = None
    suggested_price_count: int = 0

# ==================== CHORES ====================

class ChoreBase(BaseModel):
    """Base décrivant les champs communs d'une corvée (planification + attribution)."""
    name: str
    description: Optional[str] = ""
    period_type: str = "manually"  # hourly | daily | weekly | biweekly | monthly | yearly | manually
    period_hours: Optional[int] = None  # hourly
    period_days: Optional[int] = None  # daily
    weekdays: Optional[List[int]] = None  # weekly, ISO 1 (lundi) à 7 (dimanche)
    month_days: Optional[List[int]] = None  # monthly, jours du mois 1-31
    yearly_month: Optional[int] = None  # yearly, 1-12
    yearly_day: Optional[int] = None  # yearly, 1-31
    # Heure d'échéance souhaitée ("HH:MM"), ignorée pour hourly/manually.
    due_time: Optional[str] = None
    # Montant (EUR) versé au membre qui effectue cette corvée, si définie.
    reward: Optional[float] = None
    # no-assignment | in-alphabetical-order | random | who-least-did-first
    assignment_type: str = "no-assignment"
    assigned_user_id: Optional[str] = None  # assigné initial explicite (facultatif)
    # Restreint la rotation à ce sous-ensemble de membres du foyer -- None/vide
    # = tous les membres actuels du foyer sont éligibles.
    eligible_user_ids: Optional[List[str]] = None

class ChoreCreate(ChoreBase):
    """Requête de création d'une corvée."""
    # Si True, la première échéance est fixée à aujourd'hui plutôt que
    # calculée via la périodicité depuis la date de création (utile pour une
    # corvée hebdomadaire/mensuelle qu'on veut voir apparaître dès le jour
    # même, sans attendre la prochaine occurrence naturelle).
    start_today: bool = False

class ChoreUpdate(BaseModel):
    """Modèle de mise à jour partielle d'une corvée."""
    name: Optional[str] = None
    description: Optional[str] = None
    period_type: Optional[str] = None
    period_hours: Optional[int] = None
    period_days: Optional[int] = None
    weekdays: Optional[List[int]] = None
    month_days: Optional[List[int]] = None
    yearly_month: Optional[int] = None
    yearly_day: Optional[int] = None
    due_time: Optional[str] = None
    reward: Optional[float] = None
    assignment_type: Optional[str] = None
    assigned_user_id: Optional[str] = None
    eligible_user_ids: Optional[List[str]] = None

class ChoreResponse(ChoreBase):
    """Réponse API pour une corvée, avec état calculé (échéance, statut, assigné)."""
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    household_id: str
    last_done_at: Optional[datetime] = None
    next_due_at: Optional[datetime] = None
    # "overdue" | "due_today" | "due_soon" | "upcoming" | "no_schedule"
    status: str = "no_schedule"
    assigned_user_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class ChoreLogResponse(BaseModel):
    """Réponse API pour une entrée du journal d'exécution d'une corvée."""
    model_config = ConfigDict(from_attributes=True)
    id: str
    chore_id: str
    chore_name: Optional[str] = None
    executed_by_user_id: Optional[str] = None
    executed_by_username: Optional[str] = None
    executed_at: datetime
    previous_due_date: Optional[datetime] = None
    new_due_date: Optional[datetime] = None
    reward_amount: Optional[float] = None
    skipped: bool = False

class ChoreExecuteResponse(BaseModel):
    """Réponse renvoyée après avoir marqué une corvée comme faite."""
    chore: ChoreResponse
    log: ChoreLogResponse

class ChoreCalendarEntry(BaseModel):
    """Une occurrence future projetée d'une corvée, pour l'affichage calendrier."""
    chore_id: str
    chore_name: str
    due_at: datetime

# ==================== CHORE REWARDS ====================

class RewardLogEntry(BaseModel):
    """Une exécution rémunérée, telle qu'affichée dans le détail par membre."""
    chore_id: str
    chore_name: str
    executed_at: datetime
    reward_amount: float

class MemberRewardsSummary(BaseModel):
    """Récapitulatif des récompenses gagnées par un membre du foyer."""
    user_id: str
    username: str
    total_current_period: float
    total_all_time: float
    logs: List[RewardLogEntry] = []

class RewardsSummaryResponse(BaseModel):
    """Réponse de GET /api/chores/rewards/summary."""
    period_start: datetime
    weekday: int  # ISO 1 (lundi) à 7 (dimanche), jour de reset configuré pour le foyer
    members: List[MemberRewardsSummary] = []

class HouseholdRewardsSettingsUpdate(BaseModel):
    """Requête admin pour configurer les tâches du foyer (récompenses : jour
    de reset, activation ; et activation du module tâches dans son ensemble)."""
    weekday: Optional[int] = None  # ISO 1 (lundi) à 7 (dimanche)
    enabled: Optional[bool] = None  # rewards_enabled
    chores_enabled: Optional[bool] = None


# ==================== LOANS ====================

class LoanBase(BaseModel):
    """Base décrivant les champs communs d'un emprunt (livre ou jeu vidéo)."""
    type: str  # book | videogame
    title: str
    author: Optional[str] = None  # auteur (livre) ou plateforme (jeu vidéo)
    publisher: Optional[str] = None
    cover_url: Optional[str] = None
    barcode: Optional[str] = None
    source: Optional[str] = None  # "BnF" | "Open Library" | "Google Books" | "Wikidata" | None (saisie manuelle)
    notes: Optional[str] = ""

class LoanCreate(LoanBase):
    """Requête de création d'un emprunt. due_at est calculée automatiquement
    depuis la configuration du foyer (loan_book_duration_days /
    loan_game_duration_days) si non fournie explicitement."""
    borrowed_at: Optional[datetime] = None
    due_at: Optional[datetime] = None

class LoanUpdate(BaseModel):
    """Modèle de mise à jour partielle d'un emprunt."""
    type: Optional[str] = None
    title: Optional[str] = None
    author: Optional[str] = None
    publisher: Optional[str] = None
    cover_url: Optional[str] = None
    barcode: Optional[str] = None
    notes: Optional[str] = None
    borrowed_at: Optional[datetime] = None
    due_at: Optional[datetime] = None

class LoanResponse(LoanBase):
    """Réponse API pour un emprunt, avec état calculé (statut, date de retour)."""
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    household_id: str
    borrowed_at: datetime
    due_at: datetime
    returned_at: Optional[datetime] = None
    # "borrowed" | "due_soon" | "overdue" | "returned"
    status: str = "borrowed"
    created_at: datetime
    updated_at: datetime

class LoanLookupResult(BaseModel):
    """Résultat normalisé d'une recherche par code-barres/ISBN sur les API
    externes (BnF/Open Library/Google Books pour les livres, Wikidata pour
    les jeux vidéo)."""
    title: Optional[str] = None
    author: Optional[str] = None
    publisher: Optional[str] = None
    cover_url: Optional[str] = None
    source: Optional[str] = None

class HouseholdLoansSettingsUpdate(BaseModel):
    """Requête admin pour configurer les emprunts du foyer (durées par type, activation)."""
    loan_book_duration_days: Optional[int] = None
    loan_game_duration_days: Optional[int] = None
    enabled: Optional[bool] = None


# ==================== ADMIN : STATISTIQUES API ====================

class ApiCallStat(BaseModel):
    """Nombre d'appels vers une source externe donnée."""
    source: str
    count: int
    success_count: int

class ApiCallStatByUser(ApiCallStat):
    """Idem ApiCallStat, avec l'identité du compte à l'origine des appels
    (None si le compte a été supprimé depuis)."""
    user_id: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
