import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, Gift, Loader2, User } from 'lucide-react';

function formatAmount(amount) {
  return `${Number(amount).toFixed(2)} €`;
}

export default function RewardsPage() {
  const { t, i18n } = useTranslation('chores');
  const { api } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const response = await api.get('/chores/rewards/summary');
      setSummary(response.data);
    } catch (error) {
      toast.error(t('errors.loadError'));
    } finally {
      setLoading(false);
    }
  }, [api, t]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin h-12 w-12 text-primary" />
      </div>
    );
  }

  const periodStartLabel = summary
    ? new Date(summary.period_start).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  return (
    <div className="space-y-6">
      <div>
        <Link to="/chores">
          <Button variant="ghost" size="sm" className="mb-2 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-1" /> {t('rewards.backToTasks')}
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Gift className="w-7 h-7 text-primary" /> {t('rewards.title')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('rewards.periodSince', { date: periodStartLabel })}
        </p>
      </div>

      {summary && summary.members.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {summary.members.map((member) => (
            <Card key={member.user_id} className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  {member.username}
                </CardTitle>
                <div className="text-right">
                  <p className="text-2xl font-bold text-emerald-600">{formatAmount(member.total_current_period)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('rewards.totalAllTime', { amount: formatAmount(member.total_all_time) })}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                {member.logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t('rewards.empty')}</p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {member.logs.map((log, index) => (
                      <div
                        key={`${log.chore_id}-${log.executed_at}-${index}`}
                        className="flex items-center justify-between text-sm px-2 py-1.5 rounded bg-secondary/30"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{log.chore_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(log.executed_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                        <span className="font-semibold text-emerald-600 shrink-0 ml-2">
                          {formatAmount(log.reward_amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-card border-border border-dashed py-16 text-center">
          <Gift className="w-16 h-16 mx-auto text-muted-foreground/20 mb-4" />
          <p className="text-muted-foreground">{t('rewards.noMembers')}</p>
        </Card>
      )}
    </div>
  );
}
