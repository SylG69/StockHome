import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { RefreshCw, Copy, UserMinus, LogOut, Plus, KeyRound, Home, Users, Trash2, QrCode } from 'lucide-react';

export default function HouseholdPage() {
  const { t } = useTranslation('household');
  const { api, user, activeHousehold, fetchHouseholds } = useAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newHouseholdName, setNewHouseholdName] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [pendingHouseholdName, setPendingHouseholdName] = useState(null);
  // Étape courante de l'assistant de création : 'transfer' (proposer de
  // transférer le foyer actif) puis, seulement si on ne transfère pas,
  // 'defaults' (proposer les catégories/emplacements par défaut) -- les
  // deux ne sont jamais proposés ensemble pour éviter les doublons.
  const [createStep, setCreateStep] = useState(null);

  const fetchDetail = useCallback(async () => {
    if (!activeHousehold) return;
    setLoading(true);
    try {
      const response = await api.get(`/households/${activeHousehold.id}`);
      setDetail(response.data);
    } catch (error) {
      console.error('Failed to fetch household:', error);
      toast.error(t('toast.loadError'));
    } finally {
      setLoading(false);
    }
  }, [api, activeHousehold, t]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const isAdmin = detail?.role === 'admin';

  const handleCreateHousehold = (event) => {
    event.preventDefault();
    if (!newHouseholdName.trim()) return;
    // Étape 1 : propose d'abord de transférer le foyer actif (voir
    // handleTransferChoice) ; l'étape 2 (valeurs par défaut) ne s'affiche
    // que si l'utilisateur refuse le transfert.
    setPendingHouseholdName(newHouseholdName.trim());
    setCreateStep('transfer');
  };

  const cancelCreateHousehold = () => {
    setPendingHouseholdName(null);
    setCreateStep(null);
  };

  const handleTransferChoice = (wantTransfer) => {
    if (wantTransfer) {
      finalizeCreateHousehold({ transfer: true, createDefaults: false });
    } else {
      setCreateStep('defaults');
    }
  };

  const handleDefaultsChoice = (createDefaults) => {
    finalizeCreateHousehold({ transfer: false, createDefaults });
  };

  const finalizeCreateHousehold = async ({ transfer, createDefaults }) => {
    if (!pendingHouseholdName) return;
    setBusy(true);
    let createdId = null;
    try {
      const response = await api.post('/households', { name: pendingHouseholdName, create_defaults: createDefaults });
      createdId = response.data.id;
      setNewHouseholdName('');
      await fetchHouseholds();
      toast.success(t('toast.created'));
    } catch (error) {
      toast.error(error?.response?.data?.detail || t('toast.createError'));
      setBusy(false);
      cancelCreateHousehold();
      return;
    }

    if (transfer) {
      try {
        await api.post(`/households/${createdId}/transfer-stock`);
        toast.success(t('toast.transferSuccess'));
      } catch (error) {
        toast.error(error?.response?.data?.detail || t('toast.transferError'));
      }
    }

    setBusy(false);
    cancelCreateHousehold();
  };

  const handleJoinHousehold = async (event) => {
    event.preventDefault();
    if (!inviteCodeInput.trim()) return;
    setBusy(true);
    try {
      await api.post('/households/join', { invite_code: inviteCodeInput.trim() });
      setInviteCodeInput('');
      await fetchHouseholds();
      toast.success(t('toast.joined'));
    } catch (error) {
      toast.error(error?.response?.data?.detail || t('toast.joinError'));
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerateCode = async () => {
    if (!activeHousehold) return;
    setBusy(true);
    try {
      await api.post(`/households/${activeHousehold.id}/invite-code/regenerate`);
      toast.success(t('toast.codeRegenerated'));
      fetchDetail();
    } catch (error) {
      toast.error(error?.response?.data?.detail || t('toast.regenerateError'));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyCode = () => {
    if (!detail?.invite_code) return;
    navigator.clipboard.writeText(detail.invite_code);
    toast.success(t('toast.codeCopied'));
  };

  const handleRemoveMember = async (memberId) => {
    if (!activeHousehold) return;
    setBusy(true);
    try {
      await api.delete(`/households/${activeHousehold.id}/members/${memberId}`);
      toast.success(t('toast.memberRemoved'));
      fetchDetail();
    } catch (error) {
      toast.error(error?.response?.data?.detail || t('toast.removeError'));
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveHousehold = async () => {
    if (!activeHousehold) return;
    setBusy(true);
    try {
      await api.post(`/households/${activeHousehold.id}/leave`);
      toast.success(t('toast.left'));
      window.location.reload();
    } catch (error) {
      toast.error(error?.response?.data?.detail || t('toast.leaveError'));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteHousehold = async () => {
    if (!activeHousehold) return;
    setBusy(true);
    try {
      await api.delete(`/households/${activeHousehold.id}`);
      toast.success(t('toast.deleted'));
      window.location.reload();
    } catch (error) {
      toast.error(error?.response?.data?.detail || t('toast.deleteError'));
    } finally {
      setBusy(false);
      setDeleteDialogOpen(false);
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
          <h1 className="text-3xl font-bold tracking-tight">{t('page.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('page.subtitle')}
          </p>
        </div>
        <Button variant="outline" onClick={fetchDetail} data-testid="refresh-household-btn">
          <RefreshCw className="w-4 h-4 mr-2" />
          {t('page.refresh')}
        </Button>
      </div>

      {detail && (
        <Card className="bg-card border-border">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {detail.is_personal ? <Home className="w-5 h-5" /> : <Users className="w-5 h-5" />}
              <h3 className="font-bold text-lg">{detail.is_personal ? t('card.personalHousehold') : detail.name}</h3>
              <Badge variant={isAdmin ? 'default' : 'secondary'}>{isAdmin ? t('card.roleAdmin') : t('card.roleMember')}</Badge>
            </div>

            {!detail.is_personal && isAdmin && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">{t('card.inviteCodeLabel')}</span>
                  <code className="px-2 py-1 rounded bg-secondary font-mono text-sm">{detail.invite_code}</code>
                  <Button size="sm" variant="ghost" onClick={handleCopyCode}>
                    <Copy className="w-4 h-4 mr-1" />
                    {t('card.copy')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleRegenerateCode} disabled={busy}>
                    <KeyRound className="w-4 h-4 mr-1" />
                    {t('card.regenerate')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowQrCode((prev) => !prev)}
                    data-testid="toggle-qr-code-btn"
                  >
                    <QrCode className="w-4 h-4 mr-1" />
                    {showQrCode ? t('card.hideQrCode') : t('card.showQrCode')}
                  </Button>
                </div>
                {showQrCode && (
                  <div className="flex flex-col items-center gap-2 p-4 bg-secondary/30 rounded-lg w-fit">
                    <QRCodeSVG
                      value={`${window.location.origin}/join?code=${detail.invite_code}`}
                      size={160}
                      data-testid="household-invite-qrcode"
                    />
                    <p className="text-xs text-muted-foreground text-center max-w-[200px]">
                      {t('card.qrCodeHint')}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">{t('card.membersTitle', { count: detail.member_count })}</h4>
              {detail.members?.map((member) => (
                <div key={member.user_id} className="flex items-center justify-between gap-3 py-1">
                  <div className="flex items-center gap-2">
                    <span>{member.username}</span>
                    {member.user_id === user?.id && <Badge variant="secondary">{t('card.self')}</Badge>}
                    <Badge variant={member.role === 'admin' ? 'default' : 'outline'}>
                      {member.role === 'admin' ? t('card.roleAdminShort') : t('card.roleMemberShort')}
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
                      {t('card.remove')}
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {!detail.is_personal && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={handleLeaveHousehold}
                  disabled={busy}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {t('card.leave')}
                </Button>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                    disabled={busy}
                    data-testid="delete-household-btn"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t('card.delete')}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card border-border">
          <CardContent className="p-6 space-y-3">
            <h3 className="font-bold">{t('create.title')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('create.description')}
            </p>
            <form onSubmit={handleCreateHousehold} className="flex gap-2">
              <Input
                placeholder={t('create.namePlaceholder')}
                value={newHouseholdName}
                onChange={(e) => setNewHouseholdName(e.target.value)}
                disabled={busy}
              />
              <Button type="submit" disabled={busy || !newHouseholdName.trim()}>
                <Plus className="w-4 h-4 mr-1" />
                {t('create.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6 space-y-3">
            <h3 className="font-bold">{t('join.title')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('join.description')}
            </p>
            <form onSubmit={handleJoinHousehold} className="flex gap-2">
              <Input
                placeholder={t('join.codePlaceholder')}
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                disabled={busy}
              />
              <Button type="submit" disabled={busy || !inviteCodeInput.trim()}>
                {t('join.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={createStep === 'transfer'} onOpenChange={(open) => !open && cancelCreateHousehold()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('transferDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('transferDialog.descriptionBefore')}{' '}
              {activeHousehold?.is_personal ? t('transferDialog.targetPersonal') : t('transferDialog.targetNamed', { name: activeHousehold?.name })}{' '}
              {t('transferDialog.descriptionAfter')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('transferDialog.cancelAll')}</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => handleTransferChoice(false)}
              disabled={busy}
              data-testid="create-household-skip-transfer-btn"
            >
              {t('transferDialog.skip')}
            </Button>
            <AlertDialogAction
              onClick={() => handleTransferChoice(true)}
              disabled={busy}
              data-testid="create-household-with-transfer-btn"
            >
              {t('transferDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDialog.description', { name: activeHousehold?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('deleteDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteHousehold}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-delete-household-btn"
            >
              {t('deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={createStep === 'defaults'} onOpenChange={(open) => !open && cancelCreateHousehold()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('defaultsDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('defaultsDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('defaultsDialog.cancel')}</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => handleDefaultsChoice(false)}
              disabled={busy}
              data-testid="create-household-empty-btn"
            >
              {t('defaultsDialog.skip')}
            </Button>
            <AlertDialogAction
              onClick={() => handleDefaultsChoice(true)}
              disabled={busy}
              data-testid="create-household-with-defaults-btn"
            >
              {t('defaultsDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
