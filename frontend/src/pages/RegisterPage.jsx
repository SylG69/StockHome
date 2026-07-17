import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { Home, Loader2, Eye, EyeOff, Clock } from 'lucide-react';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Passe à true quand le compte est créé avec le statut "pending" :
  // on remplace alors le formulaire par l'écran d'attente de validation.
  const [pendingApproval, setPendingApproval] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !email || !password || !confirmPassword) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }

    if (password.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setLoading(true);
    try {
      const result = await register(username, email, password);

      if (result?.user?.status === 'pending') {
        // Compte créé mais en attente de validation par un administrateur :
        // le token n'a pas été stocké (voir AuthContext.register), on
        // affiche l'écran d'attente à la place du formulaire.
        setPendingApproval(true);
      } else {
        // Compte actif immédiatement (premier utilisateur / email admin) :
        // AuthContext a stocké le token, PublicRoute redirigera vers "/",
        // mais on navigue explicitement pour ne pas dépendre du re-render.
        toast.success('Compte créé avec succès');
        navigate('/');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'inscription");
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
          backgroundImage: `url('https://images.unsplash.com/photo-1658704277317-007155b64aea?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjh8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBvcmdhbml6ZWQlMjBwYW50cnklMjBzaGVsdmVzJTIwZGFyayUyMGFlc3RoZXRpY3xlbnwwfHx8fDE3NzA5ODA1MTZ8MA&ixlib=rb-4.1.0&q=85')`,
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
            Commencez à<br />
            <span className="text-primary">organiser</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-md">
            Créez votre compte et prenez le contrôle de votre stock domestique dès aujourd'hui.
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
            {pendingApproval ? (
              <>
                <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-2">
                  <Clock className="w-7 h-7 text-amber-500" />
                </div>
                <CardTitle className="text-2xl font-bold">Compte en attente de validation</CardTitle>
                <CardDescription>
                  Votre compte a bien été créé
                </CardDescription>
              </>
            ) : (
              <>
                <CardTitle className="text-2xl font-bold">Créer un compte</CardTitle>
                <CardDescription>
                  Remplissez le formulaire pour créer votre compte
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {pendingApproval ? (
              <div className="space-y-6" data-testid="pending-approval-screen">
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-center">
                  Un administrateur doit approuver votre inscription avant votre
                  première connexion. Vous pourrez vous connecter dès que votre
                  compte aura été validé.
                </div>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => navigate('/login')}
                  data-testid="back-to-login-btn"
                >
                  Retour à la connexion
                </Button>
              </div>
            ) : (
            <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Votre nom"
                  value={username}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-input border-border focus:border-primary"
                  data-testid="register-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="votre@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-input border-border focus:border-primary"
                  data-testid="register-email-input"
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
                    data-testid="register-password-input"
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
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-input border-border focus:border-primary"
                  data-testid="register-confirm-password-input"
                />
              </div>
              <Button
                type="submit"
                className="w-full btn-glow"
                disabled={loading}
                data-testid="register-submit-btn"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Création...
                  </>
                ) : (
                  "S'inscrire"
                )}
              </Button>
            </form>
            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Déjà un compte ? </span>
              <Link
                to="/login"
                className="text-primary hover:underline font-medium"
                data-testid="login-link"
              >
                Se connecter
              </Link>
            </div>
            </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}