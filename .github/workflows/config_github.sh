#!/usr/bin/env bash
# Configure les règles de protection de branche via GitHub CLI.
# Prérequis : gh CLI installé + authentifié (gh auth login)
#
# Usage :
#   chmod +x setup-branch-protection.sh
#   ./setup-branch-protection.sh <owner>/<repo>
#
# Exemple :
#   ./setup-branch-protection.sh mon-user/stockhome

set -euo pipefail

REPO="${1:?Usage: $0 <owner>/<repo>}"

echo "Configuration des règles de protection pour $REPO..."

# --- Branche main (stricte) ---
echo "→ main"
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/${REPO}/branches/main/protection" \
  -f "required_status_checks[strict]=true" \
  -f "required_status_checks[contexts][]=pylint" \
  -f "required_status_checks[contexts][]=eslint" \
  -f "required_status_checks[contexts][]=ci-testing" \
  -f "required_status_checks[contexts][]=build-and-push" \
  -F "enforce_admins=true" \
  -f "required_pull_request_reviews[required_approving_review_count]=1" \
  -F "required_pull_request_reviews[dismiss_stale_reviews]=true" \
  -f "restrictions=null" \
  -F "required_conversation_resolution=true" \
  -F "allow_force_pushes=false" \
  -F "allow_deletions=false"

# --- Branche develop (plus souple, pas de reviewers obligatoires) ---
echo "→ develop"
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/${REPO}/branches/develop/protection" \
  -f "required_status_checks[strict]=true" \
  -f "required_status_checks[contexts][]=pylint" \
  -f "required_status_checks[contexts][]=eslint" \
  -f "required_status_checks[contexts][]=ci-testing" \
  -F "enforce_admins=false" \
  -f "required_pull_request_reviews[required_approving_review_count]=0" \
  -f "restrictions=null" \
  -F "allow_force_pushes=false" \
  -F "allow_deletions=false"

echo "✅ Règles de protection configurées avec succès."