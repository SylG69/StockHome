"""Points de terminaison de gestion des foyers (households) pour StockHome."""

import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_active_household, get_current_user
from auth_service import add_default_categories_and_locations
from database import get_db

# Tables dont le stock peut être transféré d'un foyer à un autre (voir
# transfer_stock) : tout ce qui est actuellement scopé par household_id.
STOCK_MODELS = (
    models.Category,
    models.SubCategory,
    models.StorageLocation,
    models.Product,
    models.ShoppingListItem,
)

router = APIRouter(prefix="/api/households", tags=["households"])

# Caractères sans ambiguïté visuelle (pas de 0/O/1/I) pour les codes d'invitation.
INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _generate_invite_code() -> str:
    """Génère un code d'invitation aléatoire de 8 caractères."""
    return "".join(secrets.choice(INVITE_CODE_ALPHABET) for _ in range(8))


def _get_membership(db: Session, household_id: str, user_id: str) -> models.HouseholdMember | None:
    """Renvoie l'adhésion de l'utilisateur à ce foyer, ou None s'il n'en fait pas partie."""
    return db.execute(
        select(models.HouseholdMember).where(
            models.HouseholdMember.household_id == household_id,
            models.HouseholdMember.user_id == user_id,
        )
    ).scalar_one_or_none()


def _require_membership(db: Session, household_id: str, user_id: str) -> models.HouseholdMember:
    """Renvoie l'adhésion de l'utilisateur à ce foyer, ou lève une 403 s'il n'en fait pas partie."""
    membership = _get_membership(db, household_id, user_id)
    if membership is None:
        raise HTTPException(status_code=403, detail="Vous n'êtes pas membre de ce foyer")
    return membership


def _require_household_admin(db: Session, household_id: str, user_id: str) -> models.HouseholdMember:
    """Renvoie l'adhésion de l'utilisateur si elle a le rôle admin, sinon lève une 403."""
    membership = _require_membership(db, household_id, user_id)
    if membership.role != "admin":
        raise HTTPException(status_code=403, detail="Réservé à l'administrateur du foyer")
    return membership


def _member_count(db: Session, household_id: str) -> int:
    """Compte le nombre de membres du foyer."""
    return db.execute(
        select(func.count()).select_from(models.HouseholdMember).where(
            models.HouseholdMember.household_id == household_id
        )
    ).scalar_one()


def _build_household_response(
    db: Session, household: models.Household, membership: models.HouseholdMember, current_user: models.User
) -> schemas.HouseholdResponse:
    """Construit la réponse API résumée d'un foyer, du point de vue de l'utilisateur courant."""
    return schemas.HouseholdResponse(
        id=household.id,
        name=household.name,
        is_personal=household.is_personal,
        role=membership.role,
        member_count=_member_count(db, household.id),
        is_active=household.id == current_user.active_household_id,
        rewards_summary_weekday=household.rewards_summary_weekday,
    )


def _build_household_detail(
    db: Session, household: models.Household, membership: models.HouseholdMember, current_user: models.User
) -> schemas.HouseholdDetailResponse:
    """Construit la réponse API détaillée d'un foyer, avec la liste de ses membres."""
    members = db.execute(
        select(models.HouseholdMember, models.User.username)
        .join(models.User, models.User.id == models.HouseholdMember.user_id)
        .where(models.HouseholdMember.household_id == household.id)
    ).all()
    member_responses = [
        schemas.HouseholdMemberResponse(
            user_id=member.user_id, username=username, role=member.role, joined_at=member.joined_at
        )
        for member, username in members
    ]
    base = _build_household_response(db, household, membership, current_user)
    return schemas.HouseholdDetailResponse(
        **base.model_dump(),
        invite_code=household.invite_code if membership.role == "admin" else None,
        members=member_responses,
    )


@router.get("", response_model=list[schemas.HouseholdResponse])
def list_households(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Liste les foyers auxquels appartient l'utilisateur authentifié."""
    memberships = db.execute(
        select(models.HouseholdMember).where(models.HouseholdMember.user_id == current_user.id)
    ).scalars().all()
    return [
        _build_household_response(db, membership.household, membership, current_user) for membership in memberships
    ]


@router.post("", response_model=schemas.HouseholdDetailResponse)
def create_household(
    data: schemas.HouseholdCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crée un nouveau foyer partagé (non personnel), avec l'utilisateur courant comme admin."""
    household = models.Household(name=data.name, is_personal=False, created_by=current_user.id)
    for _ in range(5):
        household.invite_code = _generate_invite_code()
        try:
            db.add(household)
            db.flush()
            break
        except IntegrityError:
            db.rollback()
    else:
        raise HTTPException(status_code=500, detail="Impossible de générer un code d'invitation unique")

    membership = models.HouseholdMember(household_id=household.id, user_id=current_user.id, role="admin")
    db.add(membership)
    db.commit()
    db.refresh(household)
    db.refresh(membership)

    if data.create_defaults:
        add_default_categories_and_locations(db, current_user.id, household.id)

    return _build_household_detail(db, household, membership, current_user)


@router.post("/join", response_model=schemas.HouseholdDetailResponse)
def join_household(
    data: schemas.HouseholdJoinRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rejoint un foyer existant via son code d'invitation."""
    household = db.execute(
        select(models.Household).where(models.Household.invite_code == data.invite_code)
    ).scalar_one_or_none()
    if household is None:
        raise HTTPException(status_code=404, detail="Code d'invitation invalide")

    if _get_membership(db, household.id, current_user.id) is not None:
        raise HTTPException(status_code=400, detail="Vous êtes déjà membre de ce foyer")

    membership = models.HouseholdMember(household_id=household.id, user_id=current_user.id, role="member")
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return _build_household_detail(db, household, membership, current_user)


@router.post("/{household_id}/transfer-stock")
def transfer_stock(
    household_id: str,
    current_user: models.User = Depends(get_current_user),
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Transfère tout le stock (catégories, sous-catégories, emplacements,
    produits, liste de courses) du foyer actuellement actif vers le foyer
    ciblé. Utilisé juste après la création d'un foyer, pour proposer à
    l'utilisateur d'y déplacer son stock existant plutôt que de repartir de
    zéro -- ne modifie que household_id, user_id (créateur d'origine) est
    conservé tel quel."""
    _require_membership(db, household_id, current_user.id)
    source_id = active_household.id
    if source_id == household_id:
        raise HTTPException(status_code=400, detail="Le foyer source et le foyer cible sont identiques")

    for model in STOCK_MODELS:
        db.execute(
            model.__table__.update().where(model.household_id == source_id).values(household_id=household_id)
        )
    db.commit()
    return {"message": "Stock transféré vers le nouveau foyer"}


@router.get("/{household_id}", response_model=schemas.HouseholdDetailResponse)
def get_household(
    household_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Détail d'un foyer, incluant ses membres (code d'invitation visible pour l'admin uniquement)."""
    membership = _require_membership(db, household_id, current_user.id)
    household = db.get(models.Household, household_id)
    return _build_household_detail(db, household, membership, current_user)


@router.get("/{household_id}/members", response_model=list[schemas.HouseholdMemberResponse])
def list_members(
    household_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Liste les membres d'un foyer dont l'utilisateur courant fait partie."""
    _require_membership(db, household_id, current_user.id)
    members = db.execute(
        select(models.HouseholdMember, models.User.username)
        .join(models.User, models.User.id == models.HouseholdMember.user_id)
        .where(models.HouseholdMember.household_id == household_id)
    ).all()
    return [
        schemas.HouseholdMemberResponse(
            user_id=member.user_id, username=username, role=member.role, joined_at=member.joined_at
        )
        for member, username in members
    ]


@router.post("/{household_id}/invite-code/regenerate", response_model=schemas.HouseholdDetailResponse)
def regenerate_invite_code(
    household_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Régénère le code d'invitation d'un foyer (admin uniquement)."""
    membership = _require_household_admin(db, household_id, current_user.id)
    household = db.get(models.Household, household_id)
    if household.is_personal:
        raise HTTPException(status_code=400, detail="Un foyer personnel n'a pas de code d'invitation")

    for _ in range(5):
        household.invite_code = _generate_invite_code()
        try:
            db.flush()
            break
        except IntegrityError:
            db.rollback()
    else:
        raise HTTPException(status_code=500, detail="Impossible de générer un code d'invitation unique")

    db.commit()
    db.refresh(household)
    return _build_household_detail(db, household, membership, current_user)


@router.patch("/{household_id}/rewards-settings", response_model=schemas.HouseholdDetailResponse)
def update_rewards_settings(
    household_id: str,
    data: schemas.HouseholdRewardsSettingsUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change le jour de reset de la récapitulation des récompenses des
    corvées du foyer (admin uniquement)."""
    if not 1 <= data.weekday <= 7:
        raise HTTPException(status_code=400, detail="weekday invalide (attendu 1 à 7, ISO lundi..dimanche)")
    membership = _require_household_admin(db, household_id, current_user.id)
    household = db.get(models.Household, household_id)
    household.rewards_summary_weekday = data.weekday
    db.commit()
    db.refresh(household)
    return _build_household_detail(db, household, membership, current_user)


def _reset_active_household_if_needed(db: Session, user_id: str, household_id: str) -> None:
    """Si l'utilisateur avait ce foyer comme actif, le repointe vers son foyer personnel."""
    user = db.get(models.User, user_id)
    if user.active_household_id != household_id:
        return
    personal = db.execute(
        select(models.Household)
        .join(models.HouseholdMember, models.HouseholdMember.household_id == models.Household.id)
        .where(models.HouseholdMember.user_id == user_id, models.Household.is_personal.is_(True))
    ).scalar_one_or_none()
    user.active_household_id = personal.id if personal else None


@router.delete("/{household_id}/members/{user_id}")
def remove_member(
    household_id: str,
    user_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retire un membre d'un foyer (admin uniquement)."""
    _require_household_admin(db, household_id, current_user.id)
    household = db.get(models.Household, household_id)
    if household.is_personal:
        raise HTTPException(status_code=400, detail="Le foyer personnel ne peut pas être géré ici")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Utilisez l'action « quitter le foyer » pour vous retirer vous-même")

    target_membership = _get_membership(db, household_id, user_id)
    if target_membership is None:
        raise HTTPException(status_code=404, detail="Ce membre ne fait pas partie du foyer")

    db.delete(target_membership)
    _reset_active_household_if_needed(db, user_id, household_id)
    db.commit()
    return {"message": "Membre retiré du foyer"}


@router.post("/{household_id}/leave")
def leave_household(
    household_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Quitte un foyer partagé (soi-même)."""
    membership = _require_membership(db, household_id, current_user.id)
    household = db.get(models.Household, household_id)
    if household.is_personal:
        raise HTTPException(status_code=400, detail="Le foyer personnel ne peut pas être quitté")

    if membership.role == "admin":
        other_admin_exists = db.execute(
            select(models.HouseholdMember).where(
                models.HouseholdMember.household_id == household_id,
                models.HouseholdMember.role == "admin",
                models.HouseholdMember.user_id != current_user.id,
            )
        ).scalar_one_or_none()
        if other_admin_exists is None:
            raise HTTPException(
                status_code=400,
                detail="Promouvez un autre membre administrateur avant de quitter ce foyer",
            )

    db.delete(membership)
    _reset_active_household_if_needed(db, current_user.id, household_id)
    db.commit()
    return {"message": "Vous avez quitté le foyer"}


@router.delete("/{household_id}")
def delete_household(
    household_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Supprime définitivement un foyer partagé, tout son contenu (stock,
    catégories, emplacements, liste de courses) et retire tous ses membres
    (admin uniquement).

    users.active_household_id est NOT NULL en base (voir migration
    e7a1c4f6b2d9) : un simple ON DELETE SET NULL sur la FK échouerait donc
    avec une violation de contrainte dès qu'un membre (souvent l'admin qui
    supprime) a ce foyer comme actif. On rebascule donc explicitement tous
    les membres concernés vers leur foyer personnel avant de supprimer la
    ligne, et on nettoie preferred_household_id (nullable, mais on évite une
    référence pendante vers un foyer supprimé)."""
    _require_household_admin(db, household_id, current_user.id)
    household = db.get(models.Household, household_id)
    if household.is_personal:
        raise HTTPException(status_code=400, detail="Le foyer personnel ne peut pas être supprimé")

    member_user_ids = db.execute(
        select(models.HouseholdMember.user_id).where(models.HouseholdMember.household_id == household_id)
    ).scalars().all()
    for member_user_id in member_user_ids:
        _reset_active_household_if_needed(db, member_user_id, household_id)

    db.execute(
        update(models.User)
        .where(models.User.preferred_household_id == household_id)
        .values(preferred_household_id=None)
    )

    db.delete(household)
    db.commit()
    return {"message": "Foyer supprimé"}


@router.post("/switch", response_model=schemas.UserResponse)
def switch_household(
    data: schemas.HouseholdSwitchRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change le foyer actif de l'utilisateur courant."""
    _require_membership(db, data.household_id, current_user.id)
    current_user.active_household_id = data.household_id
    db.commit()
    db.refresh(current_user)
    return current_user
