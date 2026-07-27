import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { RefreshCw, Copy, UserMinus, LogOut, Plus, KeyRound, Home, Users } from 'lucide-react';

export default function HouseholdPage() {
  const { api, user, activeHousehold, fetchHouseholds } = useAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newHouseholdName, setNewHouseholdName] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');

  const fetchDetail = useCallback(async () => {
    if (!activeHousehold) return;
    setLoading(true);
    try {
      const response = await api.get(`/households/${activeHousehold.id}`);
      setDetail(response.data);
    } catch (error) {
      console.error('Failed to fetch household:', error);
      toast.error('Erreur lors du chargement du foyer');
    } finally {
      setLoading(false);
    }
  }, [api, activeHousehold]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const isAdmin = detail?.role === 'admin';

  const handleCreateHousehold = async (event) => {
    event.preventDefault();
    if (!newHouseholdName.trim()) return;
    setBusy(true);
    try {
      await api.post('/households', { name: newHouseholdName.trim() });
      setNewHouseholdName('');
      await fetchHouseholds();
      toast.success('Foyer créé');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erreur lors de la création du foyer');
    } finally {
      setBusy(false);
    }
  };

  const handleJoinHousehold = async (event) => {
    event.preventDefault();
    if (!inviteCodeInput.trim()) return;
    setBusy(true);
    try {
      await api.post('/households/join', { invite_code: inviteCodeInput.trim() });
      setInviteCodeInput('');
      await fetchHouseholds();
      toast.success('Vous avez rejoint le foyer');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Code d\'invitation invalide');
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerateCode = async () => {
    if (!activeHousehold) return;
    setBusy(true);
    try {
      await api.post(`/households/${activeHousehold.id}/invite-code/regenerate`);
      toast.success('Code régénéré');
      fetchDetail();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erreur lors de la régénération du code');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyCode = () => {
    if (!detail?.invite_code) return;
    navigator.clipboard.writeText(detail.invite_code);
    toast.success('Code copié');
  };

  const handleRemoveMember = async (memberId) => {
    if (!activeHousehold) return;
    setBusy(true);
    try {
      await api.delete(`/households/${activeHousehold.id}/members/${memberId}`);
      toast.success('Membre retiré');
      fetchDetail();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erreur lors du retrait');
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveHousehold = async () => {
    if (!activeHousehold) return;
    setBusy(true);
    try {
      await api.post(`/households/${activeHousehold.id}/leave`);
      toast.success('Vous avez quitté le foyer');
      window.location.reload();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erreur lors de la sortie du foyer');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="household-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mon foyer</h1>
          <p className="text-muted-foreground mt-1">
            Partagez votre stock avec d'autres comptes en les invitant dans votre foyer.
          </p>
        </div>
        <Button variant="outline" onClick={fetchDetail} data-testid="refresh-household-btn">
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualiser
        </Button>
      </div>

      {detail && (
        <Card className="bg-card border-border">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {detail.is_personal ? <Home className="w-5 h-5" /> : <Users className="w-5 h-5" />}
              <h3 className="font-bold text-lg">{detail.is_personal ? 'Foyer personnel' : detail.name}</h3>
              <Badge variant={isAdmin ? 'default' : 'secondary'}>{isAdmin ? 'Administrateur' : 'Membre'}</Badge>
            </div>

            {!detail.is_personal && isAdmin && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Code d'invitation :</span>
                <code className="px-2 py-1 rounded bg-secondary font-mono text-sm">{detail.invite_code}</code>
                <Button size="sm" variant="ghost" onClick={handleCopyCode}>
                  <Copy className="w-4 h-4 mr-1" />
                  Copier
                </Button>
                <Button size="sm" variant="outline" onClick={handleRegenerateCode} disabled={busy}>
                  <KeyRound className="w-4 h-4 mr-1" />
                  Régénérer
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Membres ({detail.member_count})</h4>
              {detail.members?.map((member) => (
                <div key={member.user_id} className="flex items-center justify-between gap-3 py-1">
                  <div className="flex items-center gap-2">
                    <span>{member.username}</span>
                    {member.user_id === user?.id && <Badge variant="secondary">Moi</Badge>}
                    <Badge variant={member.role === 'admin' ? 'default' : 'outline'}>
                      {member.role === 'admin' ? 'Admin' : 'Membre'}
                    </Badge>
                  </div>
                  {!detail.is_personal && isAdmin && member.user_id !== user?.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveMember(member.user_id)}
                      disabled={busy}
                    >
                      <UserMinus className="w-4 h-4 mr-1" />
                      Retirer
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {!detail.is_personal && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={handleLeaveHousehold}
                disabled={busy}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Quitter ce foyer
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card border-border">
          <CardContent className="p-6 space-y-3">
            <h3 className="font-bold">Créer un nouveau foyer</h3>
            <p className="text-sm text-muted-foreground">
              Créez un foyer partagé et invitez d'autres comptes à le rejoindre.
            </p>
            <form onSubmit={handleCreateHousehold} className="flex gap-2">
              <Input
                placeholder="Nom du foyer (ex: Maison)"
                value={newHouseholdName}
                onChange={(e) => setNewHouseholdName(e.target.value)}
                disabled={busy}
              />
              <Button type="submit" disabled={busy || !newHouseholdName.trim()}>
                <Plus className="w-4 h-4 mr-1" />
                Créer
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6 space-y-3">
            <h3 className="font-bold">Rejoindre un foyer</h3>
            <p className="text-sm text-muted-foreground">
              Saisissez le code d'invitation fourni par l'administrateur du foyer.
            </p>
            <form onSubmit={handleJoinHousehold} className="flex gap-2">
              <Input
                placeholder="Code d'invitation"
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                disabled={busy}
              />
              <Button type="submit" disabled={busy || !inviteCodeInput.trim()}>
                Rejoindre
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
