import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { BookOpen, Loader2 } from 'lucide-react';

// Section "Emprunts" de la page Configuration (voir ConfigurationPage.jsx) :
// permet à un admin du foyer de configurer les durées de prêt par type
// (livre/jeu vidéo) et l'activation de la fonctionnalité.
export default function LoansConfigSection() {
  const { t } = useTranslation(['configuration', 'common']);
  const { api, activeHousehold, fetchHouseholds } = useAuth();
  const isAdmin = activeHousehold?.role === 'admin';
  const [bookDays, setBookDays] = useState(activeHousehold?.loan_book_duration_days || 21);
  const [gameDays, setGameDays] = useState(activeHousehold?.loan_game_duration_days || 14);
  const [enabled, setEnabled] = useState(activeHousehold?.loans_enabled !== false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeHousehold) return;
    setBookDays(activeHousehold.loan_book_duration_days || 21);
    setGameDays(activeHousehold.loan_game_duration_days || 14);
    setEnabled(activeHousehold.loans_enabled !== false);
  }, [activeHousehold]);

  const handleSave = async () => {
    if (!activeHousehold) return;
    setSaving(true);
    try {
      await api.patch(`/households/${activeHousehold.id}/loans-settings`, {
        loan_book_duration_days: Number(bookDays),
        loan_game_duration_days: Number(gameDays),
        enabled,
      });
      await fetchHouseholds();
      toast.success(t('loans.toast.saved'));
    } catch (error) {
      toast.error(t('common:errors.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="config-loans-section">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" /> {t('page.loans')}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">{t('loans.subtitle')}</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" /> {t('loans.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
            <div>
              <Label>{t('loans.enabledLabel')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('loans.enabledDescription')}</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!isAdmin} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('loans.bookDurationLabel')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={bookDays}
                  onChange={(e) => setBookDays(e.target.value)}
                  disabled={!isAdmin || !enabled}
                />
                <span className="text-sm text-muted-foreground shrink-0">{t('loans.durationUnitDays')}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('loans.gameDurationLabel')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={gameDays}
                  onChange={(e) => setGameDays(e.target.value)}
                  disabled={!isAdmin || !enabled}
                />
                <span className="text-sm text-muted-foreground shrink-0">{t('loans.durationUnitDays')}</span>
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={!isAdmin || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common:actions.save')}
          </Button>
          {!isAdmin && (
            <p className="text-xs text-muted-foreground italic">{t('loans.adminOnly')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
