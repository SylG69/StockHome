import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Charge le fichier .env s'il existe (recherche dans le répertoire courant
# et les répertoires parents). Sans appel explicite, python-dotenv ne fait
# rien tout seul : c'était la cause du DATABASE_URL/JWT_SECRET non pris en
# compte malgré la présence du fichier .env.
load_dotenv()

# Format attendu : postgresql+psycopg2://user:password@host:5432/dbname
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg2://stockhome:changeme@localhost:5432/stockhome",
)

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
