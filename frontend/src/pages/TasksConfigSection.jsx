import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import { Gift, ListChecks, Loader2 } from 'lucide-react';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]; // ISO : 1 = lundi ... 7 = dimanche

// Section "Tâches" de la page Configuration (voir ConfigurationPage.jsx) :
// permet à un admin du foyer de configurer les récompenses des tâches --
// activation et jour de reset du récapitulatif hebdomadaire.
export default function TasksConfigSection() {
  const { t } = useTranslation(['configuration', 'common']);
  const { api, activeHousehold, fetchHouseholds } = useAuth();
  const isAdmin = activeHousehold?.role === 'admin';
  const [weekday, setWeekday] = useState(activeHousehold?.rewards_summary_weekday || 7);
  const [enabled, setEnabled] = useState(activeHousehold?.rewards_enabled !== false);
  const [moduleEnabled, setModuleEnabled] = useState(activeHousehold?.chores_enabled !== false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeHousehold) return;
    setWeekday(activeHousehold.rewards_summary_weekday || 7);
    setEnabled(activeHousehold.rewards_enabled !== false);
    setModuleEnabled(activeHousehold.chores_enabled !== false);
  }, [activeHousehold]);

  const handleSave = async () => {
    if (!activeHousehold) return;
    setSaving(true);
    try {
      await api.patch(`/households/${activeHousehold.id}/rewards-settings`, {
        weekday,
        enabled,
        chores_enabled: moduleEnabled,
      });
      await fetchHouseholds();
      toast.success(t('rewards.toast.saved'));
    } catch (error) {
      toast.error(t('common:errors.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="config-tasks-section">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-primary" /> {t('page.tasks')}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">{t('rewards.subtitle')}</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-primary" /> {t('page.tasks')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
            <div>
              <Label>{t('module.enabledLabel')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('module.enabledDescription')}</p>
            </div>
            <Switch checked={moduleEnabled} onCheckedChange={setModuleEnabled} disabled={!isAdmin} />
          </div>
        </CardContent>
      </Card>

      <Card className={`bg-card border-border ${!moduleEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" /> {t('rewards.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">{t('rewards.description')}</p>

          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
            <div>
              <Label>{t('rewards.enabledLabel')}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t('rewards.enabledDescription')}</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!isAdmin} />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="space-y-1.5 flex-1 max-w-xs">
              <Label>{t('rewards.weekdayLabel')}</Label>
              <Select value={String(weekday)} onValueChange={(v) => setWeekday(Number(v))} disabled={!isAdmin || !enabled}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d) => (
                    <SelectItem key={d} value={String(d)}>{t(`rewards.weekdayFull.${d}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={!isAdmin || saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common:actions.save')}
      </Button>
      {!isAdmin && (
        <p className="text-xs text-muted-foreground italic">{t('rewards.adminOnly')}</p>
      )}
    </div>
  );
}
