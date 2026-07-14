#!/bin/bash
# =============================================================================
# deploy.sh — Script de déploiement StockHome
# Usage : sudo ./deploy.sh [branche]
# =============================================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
APP_DIR="/appli/stockhome"
BACKEND_DIR="${APP_DIR}/backend"
FRONTEND_DIR="${APP_DIR}/frontend"
VENV="${BACKEND_DIR}/venv"
APACHE_DIR="/var/www/stockhome"
SERVICE="stockhome-api"
BRANCH="${1:-main}"

# Couleurs
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log()     { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓${NC} $1"; }
warn()    { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠${NC} $1"; }
error()   { echo -e "${RED}[$(date '+%H:%M:%S')] ✗${NC} $1"; exit 1; }

# ── Vérifications préalables ──────────────────────────────────────────────────
log "Vérification de l'environnement…"
[[ $EUID -ne 0 ]] && error "Ce script doit être exécuté en tant que root (sudo)."
command -v git  >/dev/null || error "git non trouvé."
command -v npm  >/dev/null || error "npm non trouvé."

# ── 1. Git pull ───────────────────────────────────────────────────────────────
log "━━━ 1/5 — Mise à jour du code source (git pull) ━━━"
cd "${APP_DIR}"

# Afficher la branche et le commit courant avant
BEFORE=$(git rev-parse --short HEAD 2>/dev/null || echo "inconnu")
log "Commit actuel : ${BEFORE}"

git fetch origin
git checkout "${BRANCH}" 2>/dev/null || true
git pull origin "${BRANCH}"

AFTER=$(git rev-parse --short HEAD)
if [[ "${BEFORE}" == "${AFTER}" ]]; then
  warn "Aucune modification (déjà à jour : ${AFTER}). Déploiement forcé quand même."
else
  success "Mise à jour : ${BEFORE} → ${AFTER}"
fi

# ── 2. Backend : dépendances + redémarrage ────────────────────────────────────
log "━━━ 2/5 — Mise à jour du backend ━━━"
cd "${BACKEND_DIR}"

log "Installation des dépendances Python…"
"${VENV}/bin/pip" install -r requirements.txt --quiet

log "Application des migrations Alembic…"
"${VENV}/bin/alembic" -c "${BACKEND_DIR}/alembic.ini" upgrade head

log "Redémarrage du service ${SERVICE}…"
systemctl restart "${SERVICE}"

# Attendre que le service soit opérationnel (max 15s)
RETRIES=0
until systemctl is-active --quiet "${SERVICE}"; do
  RETRIES=$((RETRIES + 1))
  if [[ $RETRIES -ge 15 ]]; then
    error "Le service ${SERVICE} n'a pas démarré. Consultez : journalctl -u ${SERVICE} -n 30"
  fi
  sleep 1
done
success "Service ${SERVICE} opérationnel."

# ── 3. Frontend : installation des dépendances ────────────────────────────────
log "━━━ 3/5 — Installation des dépendances frontend ━━━"
cd "${FRONTEND_DIR}"

if [[ -f "package-lock.json" ]]; then
  npm ci --legacy-peer-deps --silent
else
  npm install --legacy-peer-deps --silent
fi
success "Dépendances installées."

# ── 4. Frontend : build ───────────────────────────────────────────────────────
log "━━━ 4/5 — Build du frontend ━━━"
npm run build
success "Build terminé."

# ── 5. Déploiement Apache ─────────────────────────────────────────────────────
log "━━━ 5/5 — Déploiement dans Apache (${APACHE_DIR}) ━━━"

# Suppression de l'ancien build
log "Suppression de l'ancien build…"
rm -rf "${APACHE_DIR:?}"/*

# Copie du nouveau build
log "Copie du nouveau build…"
cp -r "${FRONTEND_DIR}/dist/." "${APACHE_DIR}/"

# Permissions
chown -R www-data:www-data "${APACHE_DIR}"
chmod -R 755 "${APACHE_DIR}"

success "Fichiers copiés dans ${APACHE_DIR}."

# Recharger Apache (graceful, sans interruption)
if systemctl is-active --quiet apache2; then
  apachectl graceful
  success "Apache rechargé."
else
  warn "Apache ne tourne pas — vérifiez manuellement."
fi

# ── Résumé ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Déploiement terminé avec succès !${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "  Commit déployé : ${AFTER}"
echo -e "  Backend        : systemctl status ${SERVICE}"
echo -e "  Frontend       : ${APACHE_DIR}"
echo -e "  Logs backend   : journalctl -u ${SERVICE} -f"
echo ""
