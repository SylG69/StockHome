"""FastAPI application setup for the StockHome backend."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import auth_service
import config_service
import dashboard_service
import product_service
import shopping_service
from database import Base, engine


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Crée les tables si elles n'existent pas encore (pratique en dev ;
    # en prod, utilisez plutôt Alembic pour les migrations de schéma).
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="StockHome API", version="2.0.0", lifespan=lifespan)

origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_service.router)
app.include_router(config_service.router)
app.include_router(product_service.router)
app.include_router(shopping_service.router)
app.include_router(dashboard_service.router)


@app.get("/api")
def root():
    """Return a small API metadata payload."""
    return {"message": "StockHome API v2.0.0 - PostgreSQL (psycopg2)"}
