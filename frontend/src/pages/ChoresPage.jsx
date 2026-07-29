import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet';
import { toast } from 'sonner';
import {
  ListChecks,
  Plus,
  Trash2,
  Check,
  Loader2,
  Clock,
  AlarmClock,
  History,
  Undo2,
  User,
  CalendarDays,
  Gift,
  SkipForward,
} from 'lucide-react';

const PERIOD_TYPES = ['manually', 'hourly', 'daily', 'weekly', 'biweekly', 'monthly', 'yearly'];
// Types pour lesquels choisir une heure d'échéance a du sens : "hourly" est
// déjà un intervalle (pas une heure fixe) et "manually" n'a pas d'échéance.
const TYPES_WITH_DUE_TIME = new Set(['daily', 'weekly', 'biweekly', 'monthly', 'yearly']);
const ASSIGNMENT_TYPES = ['no-assignment', 'in-alphabetical-order', 'random', 'who-least-did-first', 'fixed'];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]; // ISO : 1 = lundi ... 7 = dimanche

const STATUS_STYLES = {
  done: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  overdue: 'bg-red-500/10 text-red-600 border-red-500/30',
  due_today: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  due_soon: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30',
  upcoming: 'bg-secondary text-muted-foreground border-transparent',
  no_schedule: 'bg-secondary text-muted-foreground border-transparent',
};

// Types pour lesquels le sélecteur de jours de la semaine a du sens.
const TYPES_WITH_WEEKDAYS = new Set(['weekly', 'biweekly']);

const EMPTY_FORM = {
  name: '',
  description: '',
  period_type: 'manually',
  period_hours: 4,
  period_days: 1,
  weekdays: [],
  month_days: '',
  yearly_month: 1,
  yearly_day: 1,
  due_time: '',
  reward: '',
  start_today: false,
  assignment_type: 'no-assignment',
  assigned_user_id: '',
};

function parseMonthDays(value) {
  return value
    .split(',')
    .map((v) => parseInt(v.trim(), 10))
    .filter((v) => Number.isInteger(v) && v >= 1 && v <= 31);
}

function formatDueDate(nextDueAt, locale) {
  if (!nextDueAt) return null;
  const date = new Date(nextDueAt);
  const dateStr = date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return `${dateStr.charAt(0).toUpperCase()}${dateStr.slice(1)} · ${timeStr}`;
}

// Vue calendrier sous la liste : une semaine complète sur desktop, réduite
// aux 3 premiers jours sur mobile (colonnes 4 à 7 masquées en dessous du
// breakpoint sm -- voir le rendu, "hidden sm:flex" sur ces colonnes).
const CALENDAR_TOTAL_DAYS = 7;

function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildCalendarDays(entries) {
  const today = startOfDay(new Date());
  const days = Array.from({ length: CALENDAR_TOTAL_DAYS }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    return { date, entries: [] };
  });

  entries.forEach((entry) => {
    if (!entry.due_at) return;
    const due = startOfDay(entry.due_at);
    const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
    if (diffDays > CALENDAR_TOTAL_DAYS - 1) return;
    // Une occurrence en retard (diffDays < 0) est regroupée sur
    // "aujourd'hui" : sans ça elle disparaîtrait simplement du calendrier.
    days[Math.max(0, diffDays)].entries.push(entry);
  });

  days.forEach((day) => {
    day.entries = [...day.entries].sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  });
  return days;
}

export default function ChoresPage() {
  const { t, i18n } = useTranslation('chores');
  const { api, activeHousehold } = useAuth();
  const [chores, setChores] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [journalChore, setJournalChore] = useState(null);
  const [journalLogs, setJournalLogs] = useState([]);
  const [journalLoading, setJournalLoading] = useState(false);

  const [fullLogOpen, setFullLogOpen] = useState(false);
  const [fullLogs, setFullLogs] = useState([]);
  const [fullLogLoading, setFullLogLoading] = useState(false);

  const [calendarEntries, setCalendarEntries] = useState([]);

  const rewardsEnabled = activeHousehold?.rewards_enabled !== false;

  const fetchChores = useCallback(async () => {
    try {
      const response = await api.get('/chores');
      setChores(response.data);
    } catch (error) {
      toast.error(t('errors.loadError'));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  const fetchCalendar = useCallback(async () => {
    try {
      const response = await api.get('/chores/calendar');
      setCalendarEntries(response.data);
    } catch (error) {
      // Silencieux : le calendrier est une vue secondaire, pas bloquante.
    }
  }, [api]);

  const fetchMembers = useCallback(async () => {
    if (!activeHousehold) return;
    try {
      const response = await api.get(`/households/${activeHousehold.id}/members`);
      setMembers(response.data);
    } catch (error) {
      // Silencieux : l'attribution manuelle est juste indisponible si ça échoue.
    }
  }, [api, activeHousehold]);

  useEffect(() => {
    fetchChores();
    fetchMembers();
    fetchCalendar();
  }, [fetchChores, fetchMembers, fetchCalendar]);

  const openCreateDialog = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEditDialog = (chore) => {
    setEditingId(chore.id);
    setForm({
      name: chore.name,
      description: chore.description || '',
      period_type: chore.period_type,
      period_hours: chore.period_hours || 4,
      period_days: chore.period_days || 1,
      weekdays: chore.weekdays || [],
      month_days: (chore.month_days || []).join(','),
      yearly_month: chore.yearly_month || 1,
      yearly_day: chore.yearly_day || 1,
      due_time: chore.due_time || '',
      reward: chore.reward != null ? String(chore.reward) : '',
      assignment_type: chore.assignment_type,
      assigned_user_id: chore.assigned_user_id || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (form.assignment_type === 'fixed' && !form.assigned_user_id) {
      toast.error(t('form.fixedAssigneeRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        period_type: form.period_type,
        assignment_type: form.assignment_type,
        assigned_user_id: form.assigned_user_id || null,
        period_hours: form.period_type === 'hourly' ? Number(form.period_hours) || 1 : null,
        period_days: form.period_type === 'daily' ? Number(form.period_days) || 1 : null,
        weekdays: TYPES_WITH_WEEKDAYS.has(form.period_type) ? form.weekdays.map(Number) : null,
        month_days: form.period_type === 'monthly' ? parseMonthDays(form.month_days) : null,
        yearly_month: form.period_type === 'yearly' ? Number(form.yearly_month) : null,
        yearly_day: form.period_type === 'yearly' ? Number(form.yearly_day) : null,
        due_time: TYPES_WITH_DUE_TIME.has(form.period_type) && form.due_time ? form.due_time : null,
        reward: form.reward !== '' ? Number(form.reward) : null,
      };

      if (editingId) {
        await api.put(`/chores/${editingId}`, payload);
      } else {
        await api.post('/chores', { ...payload, start_today: form.start_today });
      }
      setDialogOpen(false);
      await fetchChores();
      toast.success(t(editingId ? 'saved' : 'created'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('errors.generic'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (choreId) => {
    try {
      await api.delete(`/chores/${choreId}`);
      setChores((prev) => prev.filter((c) => c.id !== choreId));
      toast.success(t('deleted'));
    } catch (error) {
      toast.error(t('errors.generic'));
    }
  };

  const handleExecute = async (choreId) => {
    try {
      const response = await api.post(`/chores/${choreId}/execute`);
      setChores((prev) => prev.map((c) => (c.id === choreId ? response.data.chore : c)));
      await fetchCalendar();
      toast.success(t('markedDone'));
    } catch (error) {
      toast.error(t('errors.generic'));
    }
  };

  const handleSkip = async (choreId) => {
    try {
      const response = await api.post(`/chores/${choreId}/skip`);
      setChores((prev) => prev.map((c) => (c.id === choreId ? response.data.chore : c)));
      await fetchCalendar();
      toast.success(t('skipped'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('errors.generic'));
    }
  };

  const openJournal = async (chore) => {
    setJournalChore(chore);
    setJournalLoading(true);
    try {
      const response = await api.get(`/chores/${chore.id}/logs`);
      setJournalLogs(response.data);
    } catch (error) {
      toast.error(t('errors.loadError'));
    } finally {
      setJournalLoading(false);
    }
  };

  const handleUndo = async (logId) => {
    try {
      await api.delete(`/chores/logs/${logId}`);
      toast.success(t('undone'));
      const response = await api.get(`/chores/${journalChore.id}/logs`);
      setJournalLogs(response.data);
      await fetchChores();
      await fetchCalendar();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('errors.generic'));
    }
  };

  const handleUndoFromFullLog = async (logId) => {
    try {
      await api.delete(`/chores/logs/${logId}`);
      toast.success(t('undone'));
      const response = await api.get('/chores/logs');
      setFullLogs(response.data);
      await fetchChores();
      await fetchCalendar();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('errors.generic'));
    }
  };

  // Dans le journal global (toutes tâches mêlées), seule la dernière
  // exécution de CHAQUE tâche peut être annulée (même contrainte que le
  // backend) -- comme fullLogs est trié du plus récent au plus ancien, la
  // première occurrence rencontrée par chore_id est cette dernière exécution.
  const latestLogIdByChore = useMemo(() => {
    const seenChoreIds = new Set();
    const latestIds = new Set();
    fullLogs.forEach((log) => {
      if (!seenChoreIds.has(log.chore_id)) {
        seenChoreIds.add(log.chore_id);
        latestIds.add(log.id);
      }
    });
    return latestIds;
  }, [fullLogs]);

  const openFullLog = async () => {
    setFullLogOpen(true);
    setFullLogLoading(true);
    try {
      const response = await api.get('/chores/logs');
      setFullLogs(response.data);
    } catch (error) {
      toast.error(t('errors.loadError'));
    } finally {
      setFullLogLoading(false);
    }
  };

  const overdueCount = chores.filter((c) => c.status === 'overdue').length;
  const dueTodayCount = chores.filter((c) => c.status === 'due_today').length;
  const dueSoonCount = chores.filter((c) => c.status === 'due_soon').length;
  const calendarDays = useMemo(() => buildCalendarDays(calendarEntries), [calendarEntries]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin h-12 w-12 text-primary" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('page.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm italic">{t('page.subtitle')}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={openFullLog}>
            <History className="w-4 h-4 mr-2" /> {t('journal.fullLogButton')}
          </Button>
          {rewardsEnabled && (
            <Link to="/chores/rewards">
              <Button variant="outline">
                <Gift className="w-4 h-4 mr-2" /> {t('rewards.viewButton')}
              </Button>
            </Link>
          )}
          <Button onClick={openCreateDialog} className="btn-glow">
            <Plus className="w-4 h-4 mr-2" /> {t('add')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
            <div className="p-2.5 sm:p-3 rounded-xl bg-red-500/10 shrink-0"><AlarmClock className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" /></div>
            <div className="min-w-0"><p className="text-xl sm:text-2xl font-bold">{overdueCount}</p><p className="text-xs sm:text-sm text-muted-foreground truncate">{t('stats.overdue')}</p></div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
            <div className="p-2.5 sm:p-3 rounded-xl bg-blue-500/10 shrink-0"><Clock className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" /></div>
            <div className="min-w-0"><p className="text-xl sm:text-2xl font-bold">{dueTodayCount}</p><p className="text-xs sm:text-sm text-muted-foreground truncate">{t('stats.dueToday')}</p></div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
            <div className="p-2.5 sm:p-3 rounded-xl bg-yellow-500/10 shrink-0"><ListChecks className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-700" /></div>
            <div className="min-w-0"><p className="text-xl sm:text-2xl font-bold">{dueSoonCount}</p><p className="text-xs sm:text-sm text-muted-foreground truncate">{t('stats.dueSoon')}</p></div>
          </CardContent>
        </Card>
      </div>

      {chores.length > 0 ? (
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-lg font-semibold">{t('list.title')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {chores.map((chore) => (
              <div key={chore.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{chore.name}</span>
                    <Badge variant="outline" className={STATUS_STYLES[chore.status]}>
                      {t(`status.${chore.status}`)}
                    </Badge>
                    {chore.assigned_user_name && (
                      <Badge variant="secondary" className="text-xs">
                        <User className="w-3 h-3 mr-1" /> {chore.assigned_user_name}
                      </Badge>
                    )}
                    {rewardsEnabled && chore.reward != null && (
                      <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-600">
                        <Gift className="w-3 h-3 mr-1" /> {chore.reward.toFixed(2)} €
                      </Badge>
                    )}
                  </div>
                  {chore.next_due_at && (
                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                      {formatDueDate(chore.next_due_at, i18n.language)}
                    </p>
                  )}
                  {chore.description && (
                    <p className="text-sm text-muted-foreground mt-1">{chore.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openJournal(chore)} title={t('journal.title')}>
                    <History className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={chore.status === 'done' ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => handleExecute(chore.id)}
                    disabled={chore.status === 'done'}
                  >
                    <Check className="w-4 h-4 mr-1" /> {chore.status === 'done' ? t('done') : t('markDone')}
                  </Button>
                  {chore.next_due_at && chore.status !== 'done' && (
                    <Button variant="ghost" size="sm" onClick={() => handleSkip(chore.id)} title={t('skip')}>
                      <SkipForward className="w-4 h-4 mr-1" /> {t('skip')}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => openEditDialog(chore)}>
                    {t('edit')}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(chore.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border border-dashed py-16 text-center">
          <ListChecks className="w-16 h-16 mx-auto text-muted-foreground/20 mb-4" />
          <p className="text-muted-foreground">{t('empty')}</p>
        </Card>
      )}

      {chores.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <CalendarDays className="w-5 h-5" /> {t('calendar.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 sm:gap-3">
              {calendarDays.map((day, index) => (
                <div
                  key={day.date.toISOString()}
                  className={`rounded-lg border p-2 min-h-[110px] flex-col ${index >= 3 ? 'hidden sm:flex' : 'flex'} ${
                    index === 0 ? 'border-primary/50 bg-primary/5' : 'border-border bg-secondary/20'
                  }`}
                >
                  <div className="text-center mb-2 shrink-0">
                    <p className="text-[10px] uppercase text-muted-foreground">
                      {day.date.toLocaleDateString(i18n.language, { weekday: 'short' })}
                    </p>
                    <p className={`text-sm font-bold ${index === 0 ? 'text-primary' : ''}`}>{day.date.getDate()}</p>
                  </div>
                  <div className="space-y-1 flex-1 overflow-y-auto">
                    {day.entries.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground text-center">—</p>
                    ) : (
                      day.entries.map((entry, entryIndex) => (
                        <div
                          key={`${entry.chore_id}-${entry.due_at}-${entryIndex}`}
                          className="text-[10px] leading-tight px-1.5 py-1 rounded bg-primary/10 text-primary truncate"
                          title={entry.chore_name}
                        >
                          {new Date(entry.due_at).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                          {' '}{entry.chore_name}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog création/édition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t(editingId ? 'editDialog.title' : 'addDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('form.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('form.namePlaceholder')} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('form.description')}</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>{t('form.periodType')}</Label>
              <Select value={form.period_type} onValueChange={(v) => setForm((f) => ({ ...f, period_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIOD_TYPES.map((pt) => (
                    <SelectItem key={pt} value={pt}>{t(`periodType.${pt}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!editingId && form.period_type !== 'manually' && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/30">
                <Checkbox
                  id="start-today"
                  checked={form.start_today}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, start_today: !!v }))}
                />
                <Label htmlFor="start-today" className="text-sm font-normal cursor-pointer">
                  {t('form.startToday')}
                </Label>
              </div>
            )}

            {form.period_type === 'hourly' && (
              <div className="space-y-1.5">
                <Label>{t('form.periodHours')}</Label>
                <Input type="number" min={1} value={form.period_hours} onChange={(e) => setForm((f) => ({ ...f, period_hours: e.target.value }))} />
              </div>
            )}

            {form.period_type === 'daily' && (
              <div className="space-y-1.5">
                <Label>{t('form.periodDays')}</Label>
                <Input type="number" min={1} value={form.period_days} onChange={(e) => setForm((f) => ({ ...f, period_days: e.target.value }))} />
              </div>
            )}

            {TYPES_WITH_WEEKDAYS.has(form.period_type) && (
              <div className="space-y-1.5">
                <Label>{t('form.weekdays')}</Label>
                <ToggleGroup
                  type="multiple"
                  value={form.weekdays.map(String)}
                  onValueChange={(v) => setForm((f) => ({ ...f, weekdays: v }))}
                  className="flex-wrap justify-start"
                >
                  {WEEKDAYS.map((d) => (
                    <ToggleGroupItem key={d} value={String(d)} className="text-xs">
                      {t(`weekday.${d}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )}

            {form.period_type === 'monthly' && (
              <div className="space-y-1.5">
                <Label>{t('form.monthDays')}</Label>
                <Input value={form.month_days} onChange={(e) => setForm((f) => ({ ...f, month_days: e.target.value }))} placeholder="1,15,28" />
              </div>
            )}

            {form.period_type === 'yearly' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('form.yearlyMonth')}</Label>
                  <Input type="number" min={1} max={12} value={form.yearly_month} onChange={(e) => setForm((f) => ({ ...f, yearly_month: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('form.yearlyDay')}</Label>
                  <Input type="number" min={1} max={31} value={form.yearly_day} onChange={(e) => setForm((f) => ({ ...f, yearly_day: e.target.value }))} />
                </div>
              </div>
            )}

            {TYPES_WITH_DUE_TIME.has(form.period_type) && (
              <div className="space-y-1.5">
                <Label>{t('form.dueTime')}</Label>
                <Input type="time" value={form.due_time} onChange={(e) => setForm((f) => ({ ...f, due_time: e.target.value }))} />
              </div>
            )}

            {rewardsEnabled && (
              <div className="space-y-1.5">
                <Label>{t('form.reward')}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.reward}
                  onChange={(e) => setForm((f) => ({ ...f, reward: e.target.value }))}
                  placeholder={t('form.rewardPlaceholder')}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{t('form.assignmentType')}</Label>
              <Select value={form.assignment_type} onValueChange={(v) => setForm((f) => ({ ...f, assignment_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_TYPES.map((at) => (
                    <SelectItem key={at} value={at}>{t(`assignmentType.${at}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.assignment_type !== 'no-assignment' && members.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t(form.assignment_type === 'fixed' ? 'form.fixedAssignee' : 'form.initialAssignee')}</Label>
                <Select
                  value={form.assigned_user_id || '__none__'}
                  onValueChange={(v) => setForm((f) => ({ ...f, assigned_user_id: v === '__none__' ? '' : v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {form.assignment_type !== 'fixed' && (
                      <SelectItem value="__none__">{t('form.noInitialAssignee')}</SelectItem>
                    )}
                    {members.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>{m.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t(editingId ? 'save' : 'add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Journal d'exécution */}
      <Sheet open={!!journalChore} onOpenChange={(open) => !open && setJournalChore(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('journal.titleFor', { name: journalChore?.name })}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {journalLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : journalLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t('journal.empty')}</p>
            ) : (
              journalLogs.map((log, index) => (
                <div key={log.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{log.executed_by_username || t('journal.unknownUser')}</p>
                      {log.skipped && (
                        <Badge variant="secondary" className="text-[10px] bg-secondary text-muted-foreground">
                          {t('journal.skipped')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(log.executed_at).toLocaleString()}</p>
                  </div>
                  {index === 0 && (
                    <Button variant="ghost" size="sm" onClick={() => handleUndo(log.id)}>
                      <Undo2 className="w-4 h-4 mr-1" /> {t('journal.undo')}
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Journal complet, toutes tâches confondues */}
      <Sheet open={fullLogOpen} onOpenChange={setFullLogOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('journal.fullLogTitle')}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2 max-h-[85vh] overflow-y-auto">
            {fullLogLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : fullLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t('journal.empty')}</p>
            ) : (
              fullLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{log.chore_name}</p>
                      {log.skipped && (
                        <Badge variant="secondary" className="text-[10px] bg-secondary text-muted-foreground shrink-0">
                          {t('journal.skipped')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {log.executed_by_username || t('journal.unknownUser')} · {new Date(log.executed_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {rewardsEnabled && log.reward_amount != null && (
                      <span className="text-sm font-semibold text-emerald-600">
                        {log.reward_amount.toFixed(2)} €
                      </span>
                    )}
                    {latestLogIdByChore.has(log.id) && (
                      <Button variant="ghost" size="sm" onClick={() => handleUndoFromFullLog(log.id)}>
                        <Undo2 className="w-4 h-4 mr-1" /> {t('journal.undo')}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
