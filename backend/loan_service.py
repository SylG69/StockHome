"""Points de terminaison et logique métier du module Loans (emprunts médiathèque : livres et jeux vidéo)."""

import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

import api_stats_service
import models
import schemas
from auth import get_active_household, get_current_user
from database import get_db

router = APIRouter(prefix="/api/loans", tags=["loans"])

LOAN_NOT_FOUND = "Emprunt non trouvé"

VALID_LOAN_TYPES = {"book", "videogame"}

# Fenêtre (en jours) au-delà de laquelle une échéance à venir n'est plus
# considérée comme "bientôt due" (statut jaune) -- voir _compute_status.
DUE_SOON_THRESHOLD_DAYS = 3


def _normalize_barcode(raw: str) -> str:
    """Nettoie un code-barres scanné : ne garde que les chiffres (retire
    espaces, tirets et autres séparateurs éventuels)."""
    return re.sub(r"\D", "", raw)


def _compute_due_at(household: "models.Household", loan_type: str, borrowed_at: datetime) -> datetime:
    """Calcule l'échéance de retour depuis la configuration du foyer :
    loan_book_duration_days pour les livres, loan_game_duration_days pour
    les jeux vidéo (durées distinctes, les prêts médiathèque diffèrent
    usuellement entre les deux)."""
    days = household.loan_book_duration_days if loan_type == "book" else household.loan_game_duration_days
    return borrowed_at + timedelta(days=days)


def _compute_status(due_at: datetime, returned_at: Optional[datetime], now: datetime) -> str:
    """Déduit le statut d'un emprunt : "returned" s'il a été rendu, sinon le
    statut couleur habituel (retard/bientôt dû/en cours)."""
    if returned_at is not None:
        return "returned"
    if due_at < now:
        return "overdue"
    if due_at <= now + timedelta(days=DUE_SOON_THRESHOLD_DAYS):
        return "due_soon"
    return "borrowed"


def _enrich_loan(loan: "models.Loan") -> schemas.LoanResponse:
    """Construit la réponse API d'un emprunt, avec le statut calculé."""
    return schemas.LoanResponse(
        id=loan.id,
        user_id=loan.user_id,
        household_id=loan.household_id,
        type=loan.type,
        title=loan.title,
        author=loan.author,
        publisher=loan.publisher,
        cover_url=loan.cover_url,
        barcode=loan.barcode,
        source=loan.source,
        notes=loan.notes,
        borrowed_at=loan.borrowed_at,
        due_at=loan.due_at,
        returned_at=loan.returned_at,
        status=_compute_status(loan.due_at, loan.returned_at, datetime.now(timezone.utc)),
        created_at=loan.created_at,
        updated_at=loan.updated_at,
    )


def _get_loan_or_404(db: Session, loan_id: str, household_id: str) -> models.Loan:
    """Renvoie un emprunt du foyer donné, ou lève une 404 si il n'existe pas."""
    loan = db.execute(
        select(models.Loan).where(models.Loan.id == loan_id, models.Loan.household_id == household_id)
    ).scalar_one_or_none()
    if not loan:
        raise HTTPException(status_code=404, detail=LOAN_NOT_FOUND)
    return loan


def _validate_type(loan_type: Optional[str]) -> None:
    """Vérifie que type (si fourni) est une valeur autorisée."""
    if loan_type is not None and loan_type not in VALID_LOAN_TYPES:
        raise HTTPException(status_code=400, detail=f"type invalide : {loan_type}")


@router.get("", response_model=list[schemas.LoanResponse])
def get_loans(
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Liste les emprunts du foyer actif, échéance la plus proche en premier."""
    loans = db.execute(
        select(models.Loan)
        .where(models.Loan.household_id == active_household.id)
        .order_by(models.Loan.due_at.asc())
    ).scalars().all()
    return [_enrich_loan(loan) for loan in loans]


@router.get("/{loan_id}", response_model=schemas.LoanResponse)
def get_loan(
    loan_id: str,
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Renvoie un emprunt par identifiant pour le foyer actif."""
    loan = _get_loan_or_404(db, loan_id, active_household.id)
    return _enrich_loan(loan)


@router.post("", response_model=schemas.LoanResponse)
def create_loan(
    data: schemas.LoanCreate,
    current_user: models.User = Depends(get_current_user),
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Crée un nouvel emprunt dans le foyer actif : calcule son échéance de
    retour depuis la configuration du foyer si elle n'est pas fournie."""
    _validate_type(data.type)

    borrowed_at = data.borrowed_at or datetime.now(timezone.utc)
    due_at = data.due_at or _compute_due_at(active_household, data.type, borrowed_at)

    payload = data.model_dump(exclude={"borrowed_at", "due_at"})
    if payload.get("barcode"):
        payload["barcode"] = _normalize_barcode(payload["barcode"])

    loan = models.Loan(
        **payload,
        user_id=current_user.id,
        household_id=active_household.id,
        borrowed_at=borrowed_at,
        due_at=due_at,
    )
    db.add(loan)
    db.commit()
    db.refresh(loan)
    return _enrich_loan(loan)


@router.put("/{loan_id}", response_model=schemas.LoanResponse)
def update_loan(
    loan_id: str,
    data: schemas.LoanUpdate,
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Met à jour un emprunt existant."""
    loan = _get_loan_or_404(db, loan_id, active_household.id)
    update_data = data.model_dump(exclude_unset=True)

    _validate_type(update_data.get("type"))
    if "barcode" in update_data and update_data["barcode"]:
        update_data["barcode"] = _normalize_barcode(update_data["barcode"])

    for key, value in update_data.items():
        setattr(loan, key, value)

    loan.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(loan)
    return _enrich_loan(loan)


@router.delete("/{loan_id}")
def delete_loan(
    loan_id: str,
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Supprime un emprunt du foyer actif."""
    loan = _get_loan_or_404(db, loan_id, active_household.id)
    db.delete(loan)
    db.commit()
    return {"message": "Emprunt supprimé"}


@router.post("/{loan_id}/return", response_model=schemas.LoanResponse)
def return_loan(
    loan_id: str,
    active_household: models.Household = Depends(get_active_household),
    db: Session = Depends(get_db),
):
    """Marque un emprunt comme rendu (aujourd'hui)."""
    loan = _get_loan_or_404(db, loan_id, active_household.id)
    if loan.returned_at is not None:
        raise HTTPException(status_code=400, detail="Cet emprunt a déjà été rendu")
    loan.returned_at = datetime.now(timezone.utc)
    loan.updated_at = loan.returned_at
    db.commit()
    db.refresh(loan)
    return _enrich_loan(loan)


# ==================== RECHERCHE EXTERNE : LIVRES ====================
# Cascade "du plus précis (catalogue français) au plus général", chacune
# renvoyant (résultat_normalisé, nom_de_la_source) ou (None, None) si
# introuvable/injoignable -- ne lève jamais d'exception (voir
# product_service._fetch_off_product pour le même pattern).

# BnF impose une identification claire de l'application appelante côté
# User-Agent, comme Open Food Facts (voir product_service.OFF_HEADERS).
BNF_HEADERS = {"User-Agent": "StockHome/2.0 (s.greneron@gmail.com)"}
BNF_SRU_URL = "https://catalogue.bnf.fr/api/SRU"
DUBLIN_CORE_NS = {"dc": "http://purl.org/dc/elements/1.1/", "srw": "http://www.loc.gov/zing/srw/"}


async def _fetch_bnf_book(isbn: str) -> tuple[Optional[dict], Optional[str]]:
    """Interroge le SRU de la BnF par EAN/ISBN (format dublincore). La BnF ne
    fournit pas de jaquette dans cette réponse -- cover_url reste vide, une
    des sources suivantes de la cascade la complètera si trouvée."""
    params = {
        "version": "1.2",
        "operation": "searchRetrieve",
        "query": f'bib.ean all "{isbn}"',
        "recordSchema": "dublincore",
    }
    try:
        async with httpx.AsyncClient(headers=BNF_HEADERS) as client:
            response = await client.get(BNF_SRU_URL, params=params, timeout=5.0)
        if response.status_code != 200:
            return None, None
        root = ET.fromstring(response.content)
        record = root.find(".//srw:record", DUBLIN_CORE_NS)
        if record is None:
            return None, None
        title_el = record.find(".//dc:title", DUBLIN_CORE_NS)
        creator_el = record.find(".//dc:creator", DUBLIN_CORE_NS)
        publisher_el = record.find(".//dc:publisher", DUBLIN_CORE_NS)
        if title_el is None or not title_el.text:
            return None, None
        return (
            {
                "title": title_el.text,
                "author": creator_el.text if creator_el is not None else None,
                "publisher": publisher_el.text if publisher_el is not None else None,
                "cover_url": None,
            },
            "BnF",
        )
    except (httpx.TimeoutException, httpx.RequestError, ET.ParseError):
        return None, None


async def _fetch_openlibrary_book(isbn: str) -> tuple[Optional[dict], Optional[str]]:
    """Interroge Open Library par ISBN."""
    params = {"bibkeys": f"ISBN:{isbn}", "format": "json", "jscmd": "data"}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("https://openlibrary.org/api/books", params=params, timeout=5.0)
        if response.status_code != 200:
            return None, None
        data = response.json().get(f"ISBN:{isbn}")
        if not data:
            return None, None
        authors = data.get("authors") or []
        publishers = data.get("publishers") or []
        cover = data.get("cover") or {}
        return (
            {
                "title": data.get("title"),
                "author": ", ".join(a["name"] for a in authors if a.get("name")) or None,
                "publisher": ", ".join(p["name"] for p in publishers if p.get("name")) or None,
                "cover_url": cover.get("large") or cover.get("medium") or cover.get("small"),
            },
            "Open Library",
        )
    except (httpx.TimeoutException, httpx.RequestError, ValueError):
        return None, None


async def _fetch_google_book(isbn: str) -> tuple[Optional[dict], Optional[str]]:
    """Interroge Google Books par ISBN."""
    params = {"q": f"isbn:{isbn}"}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("https://www.googleapis.com/books/v1/volumes", params=params, timeout=5.0)
        if response.status_code != 200:
            return None, None
        items = response.json().get("items") or []
        if not items:
            return None, None
        info = items[0].get("volumeInfo") or {}
        authors = info.get("authors") or []
        image_links = info.get("imageLinks") or {}
        return (
            {
                "title": info.get("title"),
                "author": ", ".join(authors) or None,
                "publisher": info.get("publisher"),
                "cover_url": image_links.get("thumbnail") or image_links.get("smallThumbnail"),
            },
            "Google Books",
        )
    except (httpx.TimeoutException, httpx.RequestError, ValueError):
        return None, None


BOOK_SOURCES = [
    ("BnF", _fetch_bnf_book),
    ("Open Library", _fetch_openlibrary_book),
    ("Google Books", _fetch_google_book),
]


@router.get("/lookup/book/{isbn}", response_model=schemas.LoanLookupResult)
async def lookup_book(
    isbn: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Recherche un livre par ISBN/EAN-13, en cascade : BnF (précision
    française) -> Open Library -> Google Books, s'arrête à la première
    réponse trouvée. Si la BnF répond mais sans jaquette, on tente aussi la
    source suivante pour la compléter."""
    clean_isbn = _normalize_barcode(isbn)
    result: Optional[dict] = None
    matched_source: Optional[str] = None

    for name, fetch in BOOK_SOURCES:
        data, source_name = await fetch(clean_isbn)
        api_stats_service.log_api_call(db, current_user.id, name, success=data is not None)
        if data is None:
            continue
        if result is None:
            result, matched_source = data, source_name
        elif not result.get("cover_url") and data.get("cover_url"):
            result["cover_url"] = data["cover_url"]
        if result.get("cover_url"):
            break

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Livre non trouvé sur les bases partenaires (BnF, Open Library, Google Books)",
        )
    return schemas.LoanLookupResult(source=matched_source, **result)


# ==================== RECHERCHE EXTERNE : JEUX VIDÉO ====================
# Wikidata uniquement (pas de RAWG.io, celui-ci n'indexe pas les
# codes-barres/EAN -- voir la discussion produit) : si Wikidata ne renvoie
# rien, l'utilisateur complète la fiche manuellement côté frontend.

WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
# Wikidata impose lui aussi un User-Agent identifiant l'application, comme
# la BnF et Open Food Facts.
WIKIDATA_HEADERS = {"User-Agent": "StockHome/2.0 (s.greneron@gmail.com)", "Accept": "application/json"}


async def _fetch_wikidata_videogame(barcode: str) -> tuple[Optional[dict], Optional[str]]:
    """Interroge Wikidata (SPARQL) pour un jeu vidéo dont l'EAN-13 (P212) ou
    l'UPC (P1230) correspond au code-barres scanné."""
    query = f"""
    SELECT ?itemLabel ?platformLabel ?image WHERE {{
      {{ ?item wdt:P212 "{barcode}". }} UNION {{ ?item wdt:P1230 "{barcode}". }}
      OPTIONAL {{ ?item wdt:P400 ?platform. }}
      OPTIONAL {{ ?item wdt:P18 ?image. }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "fr,en". }}
    }}
    LIMIT 1
    """
    try:
        async with httpx.AsyncClient(headers=WIKIDATA_HEADERS) as client:
            response = await client.get(
                WIKIDATA_SPARQL_URL, params={"query": query, "format": "json"}, timeout=6.0
            )
        if response.status_code != 200:
            return None, None
        bindings = response.json().get("results", {}).get("bindings", [])
        if not bindings:
            return None, None
        row = bindings[0]
        title = row.get("itemLabel", {}).get("value")
        if not title:
            return None, None
        return (
            {
                "title": title,
                "author": row.get("platformLabel", {}).get("value"),
                "publisher": None,
                "cover_url": row.get("image", {}).get("value"),
            },
            "Wikidata",
        )
    except (httpx.TimeoutException, httpx.RequestError, ValueError):
        return None, None


@router.get("/lookup/videogame/{barcode}", response_model=schemas.LoanLookupResult)
async def lookup_videogame(
    barcode: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Recherche un jeu vidéo par EAN/UPC sur Wikidata. Si aucun résultat
    (couverture EAN inégale sur Wikidata pour les jeux vidéo), renvoie 404 :
    le frontend propose alors une saisie manuelle plutôt qu'un fallback API
    (pas de RAWG.io, qui n'indexe pas les codes-barres)."""
    clean_barcode = _normalize_barcode(barcode)
    result, matched_source = await _fetch_wikidata_videogame(clean_barcode)
    api_stats_service.log_api_call(db, current_user.id, "Wikidata", success=result is not None)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Jeu vidéo non trouvé sur Wikidata pour ce code-barres : complétez la fiche manuellement",
        )
    return schemas.LoanLookupResult(source=matched_source, **result)
