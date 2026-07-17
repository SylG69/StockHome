import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Lock, Save, ShieldCheck, User as UserIcon } from 'lucide-react';

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
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const roleInfo = ROLE_INFO[user?.role] || ROLE_INFO.user;

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
                {user?.username?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h2 className="text-lg font-bold">{user?.username}</h2>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <UserIcon className="w-3.5 h-3.5" /> {user?.email}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Login : {user?.username}</p>
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
            <div>
              <Label>Nom d'utilisateur</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                data-testid="profile-username-input"
              />
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <Lock className="w-4 h-4" /> Changer le mot de passe <span className="text-xs text-muted-foreground font-normal">(facultatif)</span>
            </h3>
            <div className="space-y-4">
              <div>
                <Label>Mot de passe actuel</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  data-testid="profile-current-password-input"
                />
              </div>
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
