const STORAGE_KEY = 'stockhome_pending_invite_code';

// Mémorise un code d'invitation scanné avant que l'utilisateur soit
// authentifié (voir JoinHouseholdPage), pour l'appliquer automatiquement
// juste après connexion/inscription (voir completePendingInvite).
export function setPendingInviteCode(code) {
  sessionStorage.setItem(STORAGE_KEY, code);
}

export function getPendingInviteCode() {
  return sessionStorage.getItem(STORAGE_KEY);
}

export function clearPendingInviteCode() {
  sessionStorage.removeItem(STORAGE_KEY);
}

// Rejoint automatiquement le foyer en attente (s'il y en a un) juste après
// une connexion/inscription réussie. Retourne true si un foyer a été
// rejoint (pour rediriger vers /household plutôt que le tableau de bord).
export async function completePendingInvite(api) {
  const code = getPendingInviteCode();
  if (!code) return false;
  clearPendingInviteCode();
  try {
    await api.post('/households/join', { invite_code: code });
    return true;
  } catch (error) {
    console.error('Failed to auto-join pending household:', error);
    return false;
  }
}
