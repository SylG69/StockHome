"""Configuration de l'application FastAPI pour le backend StockHome."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

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
    """Retourne un petit payload de métadonnées de l'API."""
    return {"message": "StockHome API v2.0.0 - PostgreSQL (psycopg2)"}


# --- Sert le frontend buildé (React/Vite) ---
# IMPORTANT : ces routes doivent rester APRÈS toutes les routes API ci-dessus,
# sinon le catch-all interceptera les appels /api/...

STATIC_DIR = "static"
ASSETS_DIR = os.path.join(STATIC_DIR, "assets")

# On ne monte le dossier assets que s'il existe pour éviter le crash au démarrage
if os.path.exists(ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
else:
    print(f"⚠️ Warning: {ASSETS_DIR} non trouvé. Les fichiers statiques du frontend ne seront pas servis.")


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    """Catch-all : renvoie index.html pour le routing côté client (SPA)."""
    INDEX_PATH = os.path.join(STATIC_DIR, "index.html")

    if os.path.exists(INDEX_PATH):
        return FileResponse(INDEX_PATH)

    # Si on est en dev sans les statiques buildés, on renvoie un JSON explicite plutôt qu'une erreur 500
    return {"message": "StockHome API v2.0.0 - Mode API seule (Frontend non buildé localement)"}
