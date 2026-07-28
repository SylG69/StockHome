import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { setPendingInviteCode } from '../lib/pendingInvite';

// Page ouverte en scannant le QR code affiché sur HouseholdPage (URL du
// type /join?code=XXXX). Pas de wrapper ProtectedRoute/PublicRoute ici : la
// page gère elle-même les deux cas (déjà connecté ou non), voir App.jsx.
export default function JoinHouseholdPage() {
  const { t } = useTranslation('household');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { api, isAuthenticated, loading } = useAuth();
  // Un code d'invitation ne doit être consommé qu'une seule fois : évite un
  // double-appel si l'effet se déclenche deux fois (ex. React StrictMode).
  const handledRef = useRef(false);

  useEffect(() => {
    if (loading || handledRef.current) return;
    handledRef.current = true;

    const code = searchParams.get('code');
    if (!code) {
      navigate('/household');
      return;
    }

    if (!isAuthenticated) {
      // Pas encore connecté (ex: nouveau membre qui vient de scanner le QR
      // sur le téléphone d'un autre) : on mémorise le code et on l'applique
      // automatiquement juste après connexion/inscription (voir LoginPage,
      // RegisterPage, GithubCallbackPage et lib/pendingInvite).
      setPendingInviteCode(code);
      navigate('/login');
      return;
    }

    const join = async () => {
      try {
        await api.post('/households/join', { invite_code: code });
        toast.success(t('toast.joined'));
      } catch (error) {
        toast.error(error?.response?.data?.detail || t('toast.joinError'));
      } finally {
        navigate('/household');
      }
    };
    join();
  }, [loading, isAuthenticated, searchParams, navigate, api, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">{t('joinPage.processing')}</p>
      </div>
    </div>
  );
}
