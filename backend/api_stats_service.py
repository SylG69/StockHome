"""Suivi et statistiques des appels aux API externes (BnF, Open*Facts, Open
Library, Google Books, Wikidata...), consultables depuis la page Admin."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

import models
import schemas
from auth import require_admin
from database import get_db

router = APIRouter(prefix="/api/admin/api-stats", tags=["admin"])

# Seul ce compte peut consulter les statistiques agrégées de TOUS les comptes
# du serveur -- un admin applicatif "normal" (voir require_admin) ne voit que
# ses propres statistiques d'appels API.
SUPER_ADMIN_EMAIL = "s.greneron@gmail.com"


def log_api_call(db: Session, user_id: Optional[str], source: str, success: bool) -> None:
    """Enregistre un appel à une API externe. Commit immédiat et isolé : ce
    compteur ne doit jamais faire échouer ni dépendre de la transaction
    métier de l'appelant (recherche produit/emprunt)."""
    db.add(models.ApiCallLog(user_id=user_id, source=source, success=success))
    db.commit()


@router.get("/self", response_model=list[schemas.ApiCallStat])
def get_self_api_stats(
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Statistiques d'appels API externes du compte courant, groupées par source."""
    success_count_expr = func.sum(case((models.ApiCallLog.success.is_(True), 1), else_=0))
    rows = db.execute(
        select(models.ApiCallLog.source, func.count(), success_count_expr)
        .where(models.ApiCallLog.user_id == current_user.id)
        .group_by(models.ApiCallLog.source)
        .order_by(func.count().desc())
    ).all()
    return [
        schemas.ApiCallStat(source=source, count=count, success_count=int(success_sum or 0))
        for source, count, success_sum in rows
    ]


@router.get("/global", response_model=list[schemas.ApiCallStatByUser])
def get_global_api_stats(
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Statistiques d'appels API externes de TOUS les comptes du serveur,
    groupées par source et par utilisateur -- réservé à SUPER_ADMIN_EMAIL,
    un cran plus restreint que require_admin (accès applicatif habituel)."""
    if current_user.email.lower() != SUPER_ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Accès réservé")

    success_count_expr = func.sum(case((models.ApiCallLog.success.is_(True), 1), else_=0))
    rows = db.execute(
        select(
            models.ApiCallLog.source,
            models.ApiCallLog.user_id,
            models.User.username,
            models.User.email,
            func.count(),
            success_count_expr,
        )
        .outerjoin(models.User, models.User.id == models.ApiCallLog.user_id)
        .group_by(models.ApiCallLog.source, models.ApiCallLog.user_id, models.User.username, models.User.email)
        .order_by(func.count().desc())
    ).all()
    return [
        schemas.ApiCallStatByUser(
            source=source,
            user_id=user_id,
            username=username,
            email=email,
            count=count,
            success_count=int(success_sum or 0),
        )
        for source, user_id, username, email, count, success_sum in rows
    ]
