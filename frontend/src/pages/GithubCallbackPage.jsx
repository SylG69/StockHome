import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { completePendingInvite } from '../lib/pendingInvite';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

// Page de retour après redirection vers github.com/login/oauth/authorize
// (voir handleGithubLogin dans LoginPage.jsx). GitHub redirige ici avec
// ?code=...&state=... ; on vérifie le state (anti-CSRF), puis on transmet
// le code au backend qui l'échange contre un token GitHub côté serveur.
export default function GithubCallbackPage() {
  const { t } = useTranslation('auth');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithToken, api } = useAuth();
  // Un code d'autorisation GitHub n'est utilisable qu'une seule fois : ce
  // ref évite un double-échange si l'effet se déclenche deux fois (ex.
  // React StrictMode en dev), ce qui ferait échouer le second appel.
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const run = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const expectedState = sessionStorage.getItem('github_oauth_state');
      sessionStorage.removeItem('github_oauth_state');

      if (error) {
        // L'utilisateur a annulé ("access_denied") ou autre refus GitHub.
        toast.error(t('githubCallback.cancelled'));
        navigate('/login');
        return;
      }
      if (!code) {
        toast.error(t('githubCallback.invalidCode'));
        navigate('/login');
        return;
      }
      if (!state || state !== expectedState) {
        toast.error(t('githubCallback.securityCheckFailed'));
        navigate('/login');
        return;
      }

      try {
        const res = await fetch('/api/auth/github', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        if (!res.ok) {
          let detail = null;
          try {
            const errBody = await res.json();
            detail = errBody?.detail;
          } catch (_) { /* corps non-JSON : message générique */ }

          if (res.status === 403 && detail) {
            toast.warning(detail, { duration: 6000 });
            navigate('/login');
            return;
          }
          throw new Error(detail || t('githubCallback.authFailed'));
        }

        const data = await res.json();
        loginWithToken(data.access_token, data.user);
        toast.success(t('githubCallback.success'));
        const joined = await completePendingInvite(api);
        navigate(joined ? '/household' : '/');
      } catch (err) {
        toast.error(err.message || t('githubCallback.genericError'));
        navigate('/login');
      }
    };

    run();
  }, [searchParams, navigate, loginWithToken]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">{t('githubCallback.loading')}</p>
      </div>
    </div>
  );
}
