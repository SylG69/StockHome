"""Points de terminaison et logique métier du module Chores (corvées)."""

import calendar
import random
import re
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

import models
import schemas
from auth import get_active_household, get_current_user
from database import get_db

router = APIRouter(prefix="/api/chores", tags=["chores"])

CHORE_NOT_FOUND = "Corvée non trouvée"

VALID_PERIOD_TYPES = {"hourly", "daily", "weekly", "biweekly", "monthly", "yearly", "manually"}
VALID_ASSIGNMENT_TYPES = {"no-assignment", "in-alphabetical-order", "random", "who-least-did-first"}

DUE_TIME_PATTERN = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

# Fenêtre (en jours) au-delà de laquelle une échéance à venir n'est plus
# considérée comme "bientôt due" (statut jaune) -- voir _compute_status.
DUE_SOON_THRESHOLD_DAYS = 2


def _parse_int_list(value: Optional[str]) -> Optional[list[int]]:
    if not value:
        return None
    return [int(v) for v in value.split(",") if v.strip()]


def _serialize_int_list(value: Optional[list[int]]) -> Optional[str]:
    if not value:
        return None
    return ",".join(str(v) for v in sorted(set(value)))


def _safe_date(year: int, month: int, day: int) -> date:
    """Renvoie (year, month, day), en ramenant day au dernier jour du mois
    s'il le dépasse (ex: 31 février -> 28/29 février)."""
    last_day_of_month = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last_day_of_month))


def _apply_due_time(candidate: datetime, due_time: Optional[str]) -> datetime:
    """Applique l'heure d'échéance souhaitée (HH:MM) à une date calculée, si
    définie -- sinon la date garde l'heure héritée du calcul (comportement
    historique : même heure que la dernière exécution)."""
    if not due_time:
        return candidate
    hour, minute = (int(part) for part in due_time.split(":"))
    return candidate.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _compute_next_due(chore: "models.Chore", from_dt: datetime) -> Optional[datetime]:
    """Calcule la prochaine échéance à partir de from_dt (dernière exécution
    réelle, ou date de création si la corvée n'a jamais été faite).

    "daily"/"biweekly" (comme "hourly") recalculent systématiquement depuis
    from_dt plutôt que depuis un planning calendaire fixe : une exécution en
    retard décale d'autant la prochaine échéance sans jamais s'accumuler --
    c'est le comportement "sans dérive" demandé, pas besoin d'un mode
    "adaptive" séparé pour l'obtenir.
    """
    if chore.period_type == "manually":
        return None
    if chore.period_type == "hourly":
        return from_dt + timedelta(hours=chore.period_hours or 1)
    if chore.period_type == "daily":
        return _apply_due_time(from_dt + timedelta(days=chore.period_days or 1), chore.due_time)
    if chore.period_type == "biweekly":
        return _apply_due_time(from_dt + timedelta(days=14), chore.due_time)
    if chore.period_type == "weekly":
        weekdays = _parse_int_list(chore.weekdays) or [from_dt.isoweekday()]
        for offset in range(1, 8):
            candidate = from_dt + timedelta(days=offset)
            if candidate.isoweekday() in weekdays:
                return _apply_due_time(candidate, chore.due_time)
        return _apply_due_time(from_dt + timedelta(days=7), chore.due_time)
    if chore.period_type == "monthly":
        month_days = _parse_int_list(chore.month_days) or [from_dt.day]
        candidate = from_dt + timedelta(days=1)
        for _ in range(366):
            if candidate.day in month_days:
                return _apply_due_time(candidate, chore.due_time)
            candidate += timedelta(days=1)
        return _apply_due_time(from_dt + timedelta(days=30), chore.due_time)
    if chore.period_type == "yearly":
        month = chore.yearly_month or from_dt.month
        day = chore.yearly_day or from_dt.day
        candidate = datetime.combine(_safe_date(from_dt.year, month, day), from_dt.time(), tzinfo=from_dt.tzinfo)
        if candidate <= from_dt:
            candidate = datetime.combine(
                _safe_date(from_dt.year + 1, month, day), from_dt.time(), tzinfo=from_dt.tzinfo
            )
        return _apply_due_time(candidate, chore.due_time)
    return None


def _get_household_members(db: Session, household_id: str) -> list[models.HouseholdMember]:
    return db.execute(
        select(models.HouseholdMember)
        .where(models.HouseholdMember.household_id == household_id)
        .options(selectinload(models.HouseholdMember.user))
    ).scalars().all()


def _compute_next_assignee(db: Session, chore: "models.Chore") -> Optional[str]:
    """Détermine le prochain assigné selon assignment_type, parmi les membres
    actuels du foyer (un membre retiré du foyer entre-temps n'est jamais
    réassigné)."""
    if chore.assignment_type == "no-assignment":
        return None

    members = _get_household_members(db, chore.household_id)
    if not members:
        return None
    members_sorted = sorted(members, key=lambda m: m.user.username.lower())
    member_ids = [m.user_id for m in members_sorted]

    if chore.assignment_type == "random":
        return random.choice(member_ids)

    if chore.assignment_type == "in-alphabetical-order":
        if chore.assigned_user_id in member_ids:
            idx = member_ids.index(chore.assigned_user_id)
            return member_ids[(idx + 1) % len(member_ids)]
        return member_ids[0]

    if chore.assignment_type == "who-least-did-first":
        counts = dict(
            db.execute(
                select(models.ChoreLog.executed_by_user_id, func.count())
                .where(models.ChoreLog.chore_id == chore.id)
                .group_by(models.ChoreLog.executed_by_user_id)
            ).all()
        )
        # member_ids est déjà trié alphabétiquement : min() départage les
        # égalités de comptage en gardant le premier par ordre alphabétique.
        return min(member_ids, key=lambda uid: counts.get(uid, 0))

    return None


def _compute_status(next_due_at: Optional[datetime], now: datetime) -> str:
    if next_due_at is None:
        return "no_schedule"
    if next_due_at < now:
        return "overdue"
    if next_due_at.date() == now.date():
        return "due_today"
    if next_due_at <= now + timedelta(days=DUE_SOON_THRESHOLD_DAYS):
        return "due_soon"
    return "upcoming"


def _enrich_chore(chore: "models.Chore") -> schemas.ChoreResponse:
    return schemas.ChoreResponse(
        id=chore.id,
        user_id=chore.user_id,
        household_id=chore.household_id,
        name=chore.name,
        description=chore.description,
        period_type=chore.period_type,
        period_hours=chore.period_hours,
        period_days=chore.period_days,
        weekdays=_parse_int_list(chore.weekdays),
        month_days=_parse_int_list(chore.month_days),
        yearly_month=chore.yearly_month,
        yearly_day=chore.yearly_day,
        due_time=chore.due_time,
        reward=float(chore.reward) if chore.reward is not None else None,
        assignment_type=chore.assignment_type,
        assigned_user_id=chore.assigned_user_id,
        last_done_at=chore.last_done_at,
        next_due_at=chore.next_due_at,
        status=_compute_status(chore.next_due_at, datetime.now(timezone.utc)),
        assigned_user_name=chore.assigned_user.username if chore.assigned_user else None,
        created_at=chore.created_at,
        updated_at=chore.updated_at,
    )


def _get_chore_or_404(db: Session, chore_id: str, household_id: str) -> models.Chore:
    chore = db.execute(
        select(models.Chore)
        .where(models.Chore.id == chore_id, models.Chore.household_id == household_id)
        .options(selectinload(models.Chore.assigned_user))
    ).scalar_one_or_none()
    if not chore:
        raise HTTPException(status_code=404, detail=CHORE_NOT_FOUND)
    return chore


def _validate_household_member(db: Session, household_id: str, user_id: str) -> None:
    exists = db.execute(
        select(models.HouseholdMember.id).where(
            models.HouseholdMember.household_id == household_id,
            models.HouseholdMember.user_id == user_id,
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=400, detail="assigned_user_id invalide : ce membre n'appartient pas au foyer")


def _validate_types(period_type: Optional[str], assignment_type: Optional[str]) -> None:
    if period_type is not None and period_type not in VALID_PERIOD_TYPES:
        raise HTTPException(status_code=400, detail=f"period_type invalide : {period_type}")
    if assignment_type is not None and assignment_type not in VALID_ASSIGNMENT_TYPES:
        raise HTTPException(status_code=400, detail=f"assignment_type invalide : {assignment_type}")


def _validate_due_time(due_time: Optional[str]) -> None:
    if due_time is not None and not DUE_TIME_PATTERN.match(due_time):
        raise HTTPException(status_code=400, detail=f"due_time invalide (attendu HH:MM) : {due_time}")


def _validate_reward(reward: Optional[float]) -> None:
    if reward is not None and reward < 0:
        raise HTTPException(status_code=400, detail="reward invalide : doit être positif ou nul")


def _period_start(weekday: int, now: datetime) -> datetime:
    """Renvoie le début (minuit) de la période de récompenses courante :
    le dernier jour correspondant à `weekday` (ISO 1=lundi..7=dimanche),
    aujourd'hui inclus si `now` tombe justement ce jour-là."""
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    diff = (today.isoweekday() - weekday) % 7
    return today - timedelta(days=diff)


@router.get("", response_model=list[schemas.ChoreResponse])
def get_chores(
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Liste les corvées du foyer actif, échéance la plus proche en premier
    (les corvées manuelles sans échéance sont renvoyées en dernier)."""
    chores = db.execute(
        select(models.Chore)
        .where(models.Chore.household_id == active_household.id)
        .options(selectinload(models.Chore.assigned_user))
        .order_by(models.Chore.next_due_at.asc().nulls_last())
    ).scalars().all()
    return [_enrich_chore(c) for c in chores]


@router.get("/rewards/summary", response_model=schemas.RewardsSummaryResponse)
def get_rewards_summary(
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Récapitule les récompenses gagnées par chaque membre actuel du foyer :
    total depuis le dernier reset (rewards_summary_weekday) et total depuis
    toujours, avec le détail des exécutions rémunérées."""
    period_start = _period_start(active_household.rewards_summary_weekday, datetime.now(timezone.utc))

    members_sorted = sorted(_get_household_members(db, active_household.id), key=lambda m: m.user.username.lower())

    rows = db.execute(
        select(models.ChoreLog, models.Chore.name)
        .join(models.Chore, models.Chore.id == models.ChoreLog.chore_id)
        .where(
            models.ChoreLog.household_id == active_household.id,
            models.ChoreLog.reward_amount.is_not(None),
        )
        .order_by(models.ChoreLog.executed_at.desc())
    ).all()

    entries_by_user: dict[str, list] = {}
    for log, chore_name in rows:
        if log.executed_by_user_id is None:
            continue
        entries_by_user.setdefault(log.executed_by_user_id, []).append((log, chore_name))

    members = []
    for member in members_sorted:
        entries = entries_by_user.get(member.user_id, [])
        total_all_time = sum(float(log.reward_amount) for log, _ in entries)
        total_current_period = sum(
            float(log.reward_amount) for log, _ in entries if log.executed_at >= period_start
        )
        members.append(
            schemas.MemberRewardsSummary(
                user_id=member.user_id,
                username=member.user.username,
                total_current_period=round(total_current_period, 2),
                total_all_time=round(total_all_time, 2),
                logs=[
                    schemas.RewardLogEntry(
                        chore_id=log.chore_id,
                        chore_name=chore_name,
                        executed_at=log.executed_at,
                        reward_amount=float(log.reward_amount),
                    )
                    for log, chore_name in entries
                ],
            )
        )

    return schemas.RewardsSummaryResponse(
        period_start=period_start,
        weekday=active_household.rewards_summary_weekday,
        members=members,
    )


@router.get("/{chore_id}", response_model=schemas.ChoreResponse)
def get_chore(
    chore_id: str,
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Renvoie une corvée par identifiant pour le foyer actif."""
    chore = _get_chore_or_404(db, chore_id, active_household.id)
    return _enrich_chore(chore)


@router.post("", response_model=schemas.ChoreResponse)
def create_chore(
    data: schemas.ChoreCreate,
    current_user: models.User = Depends(get_current_user),
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Crée une nouvelle corvée dans le foyer actif : calcule sa première
    échéance et son assignation initiale."""
    _validate_types(data.period_type, data.assignment_type)
    _validate_due_time(data.due_time)
    _validate_reward(data.reward)
    if data.assigned_user_id:
        _validate_household_member(db, active_household.id, data.assigned_user_id)

    payload = data.model_dump()
    payload["weekdays"] = _serialize_int_list(payload["weekdays"])
    payload["month_days"] = _serialize_int_list(payload["month_days"])

    chore = models.Chore(**payload, user_id=current_user.id, household_id=active_household.id)
    now = datetime.now(timezone.utc)
    chore.next_due_at = _compute_next_due(chore, now)
    db.add(chore)
    db.flush()

    if not data.assigned_user_id and data.assignment_type != "no-assignment":
        chore.assigned_user_id = _compute_next_assignee(db, chore)

    db.commit()
    db.refresh(chore, attribute_names=["assigned_user"])
    return _enrich_chore(chore)


@router.put("/{chore_id}", response_model=schemas.ChoreResponse)
def update_chore(
    chore_id: str,
    data: schemas.ChoreUpdate,
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Met à jour une corvée existante : recalcule l'échéance si le type ou
    la configuration de période a changé."""
    chore = _get_chore_or_404(db, chore_id, active_household.id)
    update_data = data.model_dump(exclude_unset=True)

    _validate_types(update_data.get("period_type"), update_data.get("assignment_type"))
    if "due_time" in update_data:
        _validate_due_time(update_data["due_time"])
    if "reward" in update_data:
        _validate_reward(update_data["reward"])
    if update_data.get("assigned_user_id"):
        _validate_household_member(db, active_household.id, update_data["assigned_user_id"])

    schedule_changed = any(
        key in update_data
        for key in (
            "period_type", "period_hours", "period_days", "weekdays", "month_days",
            "yearly_month", "yearly_day", "due_time",
        )
    )

    if "weekdays" in update_data:
        update_data["weekdays"] = _serialize_int_list(update_data["weekdays"])
    if "month_days" in update_data:
        update_data["month_days"] = _serialize_int_list(update_data["month_days"])

    for key, value in update_data.items():
        setattr(chore, key, value)

    if schedule_changed:
        base_dt = chore.last_done_at or chore.created_at
        chore.next_due_at = _compute_next_due(chore, base_dt)

    chore.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(chore, attribute_names=["assigned_user"])
    return _enrich_chore(chore)


@router.delete("/{chore_id}")
def delete_chore(
    chore_id: str,
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Supprime une corvée (et son journal, via cascade) du foyer actif."""
    chore = _get_chore_or_404(db, chore_id, active_household.id)
    db.delete(chore)
    db.commit()
    return {"message": "Corvée supprimée"}


@router.post("/{chore_id}/execute", response_model=schemas.ChoreExecuteResponse)
def execute_chore(
    chore_id: str,
    current_user: models.User = Depends(get_current_user),
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Marque une corvée comme faite : journalise l'exécution (avec l'état
    précédent, pour permettre un undo exact), recalcule la prochaine
    échéance et le prochain assigné."""
    chore = _get_chore_or_404(db, chore_id, active_household.id)
    now = datetime.now(timezone.utc)

    previous_due_date = chore.next_due_at
    previous_assigned_user_id = chore.assigned_user_id

    chore.last_done_at = now
    chore.next_due_at = _compute_next_due(chore, now)
    chore.assigned_user_id = _compute_next_assignee(db, chore)
    chore.updated_at = now

    log = models.ChoreLog(
        chore_id=chore.id,
        household_id=active_household.id,
        executed_by_user_id=current_user.id,
        executed_at=now,
        previous_due_date=previous_due_date,
        previous_assigned_user_id=previous_assigned_user_id,
        new_due_date=chore.next_due_at,
        reward_amount=chore.reward,
    )
    db.add(log)
    db.commit()
    db.refresh(chore, attribute_names=["assigned_user"])
    db.refresh(log)

    log_response = schemas.ChoreLogResponse(
        id=log.id,
        chore_id=log.chore_id,
        executed_by_user_id=log.executed_by_user_id,
        executed_by_username=current_user.username,
        executed_at=log.executed_at,
        previous_due_date=log.previous_due_date,
        new_due_date=log.new_due_date,
        reward_amount=float(log.reward_amount) if log.reward_amount is not None else None,
    )
    return schemas.ChoreExecuteResponse(chore=_enrich_chore(chore), log=log_response)


@router.get("/{chore_id}/logs", response_model=list[schemas.ChoreLogResponse])
def get_chore_logs(
    chore_id: str,
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Renvoie le journal d'exécution d'une corvée, plus récent en premier."""
    _get_chore_or_404(db, chore_id, active_household.id)
    rows = db.execute(
        select(models.ChoreLog, models.User.username)
        .outerjoin(models.User, models.User.id == models.ChoreLog.executed_by_user_id)
        .where(models.ChoreLog.chore_id == chore_id)
        .order_by(models.ChoreLog.executed_at.desc())
    ).all()
    return [
        schemas.ChoreLogResponse(
            id=log.id,
            chore_id=log.chore_id,
            executed_by_user_id=log.executed_by_user_id,
            executed_by_username=username,
            executed_at=log.executed_at,
            previous_due_date=log.previous_due_date,
            new_due_date=log.new_due_date,
            reward_amount=float(log.reward_amount) if log.reward_amount is not None else None,
        )
        for log, username in rows
    ]


@router.delete("/logs/{log_id}")
def undo_chore_log(
    log_id: str,
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Annule la dernière exécution d'une corvée : restaure l'échéance et
    l'assigné précédents depuis le journal, puis supprime l'entrée. Refuse
    l'annulation si une exécution plus récente existe déjà (on ne peut
    annuler que dans l'ordre inverse de l'historique)."""
    log = db.execute(
        select(models.ChoreLog).where(
            models.ChoreLog.id == log_id, models.ChoreLog.household_id == active_household.id
        )
    ).scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="Entrée de journal non trouvée")

    latest_log_id = db.execute(
        select(models.ChoreLog.id)
        .where(models.ChoreLog.chore_id == log.chore_id)
        .order_by(models.ChoreLog.executed_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if latest_log_id != log.id:
        raise HTTPException(status_code=400, detail="Seule la dernière exécution de cette corvée peut être annulée")

    chore = db.get(models.Chore, log.chore_id)

    previous_log = db.execute(
        select(models.ChoreLog)
        .where(models.ChoreLog.chore_id == log.chore_id, models.ChoreLog.id != log.id)
        .order_by(models.ChoreLog.executed_at.desc())
        .limit(1)
    ).scalar_one_or_none()

    chore.next_due_at = log.previous_due_date
    chore.assigned_user_id = log.previous_assigned_user_id
    chore.last_done_at = previous_log.executed_at if previous_log else None
    chore.updated_at = datetime.now(timezone.utc)

    db.delete(log)
    db.commit()
    return {"message": "Exécution annulée"}
