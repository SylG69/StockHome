# --- ÉTAPE 1 : Build du Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/ .
RUN npm run build

# --- ÉTAPE 2 : Build du Backend et Image Finale ---
FROM python:3.11-slim
WORKDIR /app

# Installation des dépendances Back
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copie du code Back
COPY backend/ .

# Copie du Front fraîchement buildé vers le dossier statique du Back
# (Ajuste le chemin selon ton framework Back, ex: "static/" pour FastAPI)
COPY --from=frontend-builder /app/frontend/dist ./static

RUN chmod +x entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]