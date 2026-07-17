import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { Home, Loader2, Eye, EyeOff, Github } from 'lucide-react';

export default function LoginPage() {
  const { login, loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Référence au conteneur du bouton Google, pour mesurer sa largeur réelle
  // et la transmettre à Google (son bouton est rendu dans un iframe qui
  // attend une largeur en pixels -- "100%" est ignoré, d'où le bouton trop
  // étroit par défaut, mal aligné avec celui de GitHub).
  const googleBtnContainerRef = useRef(null);

  // 1. Gestion de l'authentification Google via useEffect
  useEffect(() => {
// Cette fonction sera appelée par Google dès que l'utilisateur aura choisi son compte
    const handleCredentialResponse = async (response) => {
      setLoading(true);
      try {
        const idToken = response.credential;

        // On envoie ce jeton à ton backend FastAPI
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: idToken })
        });

        if (!res.ok) {
          // Le backend renvoie un 403 avec un message explicite si le
          // compte (nouvellement créé via Google ou existant) est en
          // attente de validation ou désactivé : on remonte ce message
          // au lieu d'une erreur générique.
          let detail = null;
          try {
            const errBody = await res.json();
            detail = errBody?.detail;
          } catch (_) { /* corps non-JSON : on garde le message générique */ }

          if (res.status === 403 && detail) {
            toast.warning(detail, { duration: 6000 });
            return;
          }
          throw new Error(detail || "Échec de l'authentification avec Google");
        }

        const data = await res.json();

        loginWithToken(data.access_token, data.user);

        // Connexion réussie !
        toast.success('Connexion Google réussie');
        navigate('/'); // Redirection vers le tableau de bord après la connexion
      } catch (error) {
        toast.error(error.message || 'Erreur lors de la connexion Google');
      } finally {
        setLoading(false);
      }
    };

    const script = document.createElement('script');
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      /* global google */
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: "168521676002-u4gd6ltbs8kknb8noim1q7dhtkcpusk6.apps.googleusercontent.com",
          callback: handleCredentialResponse,
          context: "signin",
        });

        // Rendu du bouton officiel dans la div référencée par
        // googleBtnContainerRef. Google exige une largeur en pixels (nombre,
        // 400 max) : on mesure donc la largeur réelle du conteneur plutôt
        // que de lui passer "100%" (ignoré, d'où un bouton trop étroit).
        const container = googleBtnContainerRef.current;
        const measuredWidth = container ? Math.min(container.offsetWidth, 400) : 300;

        window.google.accounts.id.renderButton(
          container,
          { theme: "outline", size: "large", width: measuredWidth, text: "signin_with" }
        );
      }
    };
    document.body.appendChild(script);

    // Nettoyage au démontage du composant
    return () => {
      document.body.removeChild(script);
    };
  }, [navigate]);

  const handleGithubLogin = () => {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || '';
    const redirectUri = import.meta.env.VITE_GITHUB_REDIRECT_URI || `${window.location.origin}/auth/github/callback`;

    if (!clientId) {
      toast.error('Connexion GitHub non configurée (VITE_GITHUB_CLIENT_ID manquant)');
      return;
    }

    // Jeton anti-CSRF : vérifié par GithubCallbackPage au retour, pour
    // s'assurer que la redirection provient bien de cette tentative de
    // connexion et pas d'une requête forgée.
    const state = crypto.randomUUID();
    sessionStorage.setItem('github_oauth_state', state);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
      state,
    });
    window.location.href = `https://github.com/login/oauth/authorize?${params.toString()}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      toast.success('Connexion réussie');
      navigate('/');
    } catch (error) {
      // Le backend renvoie un 403 avec un message explicite pour les
      // comptes en attente de validation ("pending") ou désactivés :
      // on l'affiche tel quel, en avertissement plutôt qu'en erreur.
      const detail = error.response?.data?.detail;
      if (error.response?.status === 403 && detail) {
        toast.warning(detail, { duration: 6000 });
      } else {
        toast.error(detail || 'Erreur de connexion');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Image */}
      <div
        className="hidden lg:flex lg:w-1/2 relative bg-cover bg-center"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1767416566592-cb33f17eb088?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjh8MHwxfHNlYXJjaHw0fHxtb2Rlcm4lMjBvcmdhbml6ZWQlMjBwYW50cnklMjBzaGVsdmVzJTIwZGFyayUyMGFlc3RoZXRpY3xlbnwwfHx8fDE3NzA5ODA1MTZ8MA&ixlib=rb-4.1.0&q=85')`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 to-background/50" />
        <div className="relative z-10 flex flex-col justify-center px-12">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <Home className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">StockHome</h1>
          </div>
          <h2 className="text-4xl font-bold mb-4">
            Gérez votre stock<br />
            <span className="text-primary">à domicile</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-md">
            Organisez vos produits, suivez vos stocks et générez automatiquement vos listes de courses.
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <Card className="w-full max-w-md border-border bg-card">
          <CardHeader className="space-y-1 text-center">
            <div className="lg:hidden flex items-center justify-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <Home className="w-5 h-5 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-bold">StockHome</h1>
            </div>
            <CardTitle className="text-2xl font-bold">Connexion</CardTitle>
            <CardDescription>
              Entrez vos identifiants pour accéder à votre compte
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="votre@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-input border-border focus:border-primary"
                  data-testid="login-email-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-input border-border focus:border-primary pr-10"
                    data-testid="login-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full btn-glow"
                disabled={loading}
                data-testid="login-submit-btn"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connexion...
                  </>
                ) : (
                  'Se connecter'
                )}
              </Button>
            </form>

            {/* Séparateur visuel */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Ou continuer avec</span>
              </div>
            </div>

            {/* 2. Emplacement unique pour le bouton Google */}
            <div ref={googleBtnContainerRef} className="w-full flex justify-center"></div>

            {/* Bouton GitHub (flux OAuth par redirection, pas de SDK JS) */}
            <Button
              type="button"
              variant="outline"
              className="w-full mt-3 gap-2"
              onClick={handleGithubLogin}
              data-testid="github-login-btn"
            >
              <Github className="w-4 h-4" />
              Continuer avec GitHub
            </Button>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Pas encore de compte ? </span>
              <Link
                to="/register"
                className="text-primary hover:underline font-medium"
                data-testid="register-link"
              >
                S'inscrire
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}