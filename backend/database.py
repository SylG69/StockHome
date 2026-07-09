"""Database setup and session helpers for StockHome."""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Charge le fichier .env s'il existe
load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("Erreur : DATABASE_URL n'est pas définie dans le fichier .env ou le fichier est introuvable.")

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)

session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """Base class for SQLAlchemy models."""


def get_db():
    """Yield a database session and close it after use."""
    db: Session = session_local()
    try:
        yield db
    finally:
        db.close()
