import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Lock, Save, ShieldCheck, User as UserIcon, Mail, Apple, KeyRound } from 'lucide-react';
import Github from '../components/icons/GithubIcon';

// lucide-react n'a pas d'icône de marque Google : petit logo officiel en SVG.
function GoogleIcon(props) {
  return (
    <svg viewBox="0 0 48 48" width="14" height="14" {...props}>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.6 5.1C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.6 5.6C41.9 36 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z"/>
    </svg>
  );
}

// Méthodes de connexion connues. Ajouter une entrée ici suffit pour qu'un
// futur SSO (GitHub, Apple...) s'affiche automatiquement dès que le backend
// renseigne la clé correspondante dans auth_methods.
const AUTH_METHOD_INFO = {
  email: { label: 'Email et mot de passe', icon: Mail },
  google: { label: 'Google', icon: GoogleIcon },
  github: { label: 'GitHub', icon: Github },
  apple: { label: 'Apple', icon: Apple },
};

const ROLE_INFO = {
  admin: {
    label: 'Administrateur',
    description: "Accès complet : lecture, modification et gestion des utilisateurs.",
  },
  user: {
    label: 'Utilisateur',
    description: "Accès standard : gestion de votre propre stock.",
  },
};

export default function ProfilePage() {
  const { api, user, updateUser } = useAuth();

  const [username, setUsername] = useState(user?.username || '');
  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const roleInfo = ROLE_INFO[user?.role] || ROLE_INFO.user;
  const hasPassword = user?.auth_methods?.includes('email');

  // Nom affiché : "Prénom Nom" si renseignés, sinon le username (login).
  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username;

  const handleSave = async () => {
    if (!username.trim()) {
      toast.error("Le nom d'utilisateur ne peut pas être vide");
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      toast.error('Le nouveau mot de passe doit contenir au moins 6 caractères');
      return;
    }

    const payload = {};
    if (username.trim() !== user?.username) payload.username = username.trim();
    if (firstName.trim() !== (user?.first_name || '')) payload.first_name = firstName.trim();
    if (lastName.trim() !== (user?.last_name || '')) payload.last_name = lastName.trim();
    if (newPassword) {
      payload.new_password = newPassword;
      payload.current_password = currentPassword;
    }

    if (Object.keys(payload).length === 0) {
      toast.info('Aucune modification à enregistrer');
      return;
    }

    setSaving(true);
    try {
      const response = await api.patch('/auth/me', payload);
      toast.success('Profil mis à jour');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // Met à jour le contexte d'authentification si la fonction est
      // disponible, pour refléter immédiatement le nouveau username dans le
      // menu (sinon il faudra un rechargement pour le voir mis à jour).
      if (typeof updateUser === 'function') {
        updateUser(response.data);
      }
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl" data-testid="profile-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mon profil</h1>
        <p className="text-muted-foreground mt-1">Gérez vos informations personnelles</p>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-6 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-xl font-bold text-primary">
                {displayName?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h2 className="text-lg font-bold">{displayName}</h2>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <UserIcon className="w-3.5 h-3.5" /> {user?.email}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Login : {user?.username}</p>
              {user?.auth_methods?.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  {user.auth_methods.map((method) => {
                    const info = AUTH_METHOD_INFO[method] || { label: method, icon: KeyRound };
                    const Icon = info.icon;
                    return (
                      <Badge key={method} variant="outline" className="gap-1.5 font-normal text-xs">
                        <Icon className="w-3 h-3" /> {info.label}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <Badge className="gap-1 mb-1">
              <ShieldCheck className="w-3 h-3" /> {roleInfo.label}
            </Badge>
            <p className="text-xs text-muted-foreground max-w-[220px]">{roleInfo.description}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardContent className="p-6 space-y-6">
          <div>
            <h3 className="font-semibold text-primary mb-4">Modifier mes informations</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Prénom</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  data-testid="profile-firstname-input"
                />
              </div>
              <div>
                <Label>Nom</Label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  data-testid="profile-lastname-input"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Nom d'utilisateur (login)</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  data-testid="profile-username-input"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <h3 className="font-semibold flex items-center gap-2 mb-1">
              <Lock className="w-4 h-4" />
              {hasPassword ? 'Changer le mot de passe' : 'Définir un mot de passe'}
              <span className="text-xs text-muted-foreground font-normal">(facultatif)</span>
            </h3>
            {!hasPassword && (
              <p className="text-xs text-muted-foreground mb-4">
                Votre compte est connecté via Google et n'a pas encore de mot de passe.
                Vous pouvez en définir un ici pour pouvoir aussi vous connecter avec votre email.
              </p>
            )}
            <div className="space-y-4">
              {hasPassword && (
                <div>
                  <Label>Mot de passe actuel</Label>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    data-testid="profile-current-password-input"
                  />
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Nouveau mot de passe</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    data-testid="profile-new-password-input"
                  />
                </div>
                <div>
                  <Label>Confirmer</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    data-testid="profile-confirm-password-input"
                  />
                </div>
              </div>
            </div>
          </div>

          <Button className="w-full btn-glow" onClick={handleSave} disabled={saving} data-testid="save-profile-btn">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}