import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { BarChart3, Globe, Loader2 } from 'lucide-react';

const SUPER_ADMIN_EMAIL = 's.greneron@gmail.com';

function StatsTable({ rows, t, showUser }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">{t('apiStats.empty')}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">{t('apiStats.table.source')}</th>
            {showUser && <th className="py-2 pr-4 font-medium">{t('apiStats.table.account')}</th>}
            <th className="py-2 pr-4 font-medium text-right">{t('apiStats.table.count')}</th>
            <th className="py-2 font-medium text-right">{t('apiStats.table.successCount')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.source}-${row.user_id || 'self'}-${index}`} className="border-b border-border/50">
              <td className="py-2 pr-4">{row.source}</td>
              {showUser && (
                <td className="py-2 pr-4 text-muted-foreground">
                  {row.username ? `${row.username} (${row.email})` : t('apiStats.table.unknownAccount')}
                </td>
              )}
              <td className="py-2 pr-4 text-right font-semibold">{row.count}</td>
              <td className="py-2 text-right text-muted-foreground">{row.success_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Section "Statistiques API" de la page Administrateur : nombre d'appels
// vers chaque API externe (BnF, Open Food Facts, Wikidata...), pour le
// compte courant et, réservé à SUPER_ADMIN_EMAIL, pour l'ensemble des
// comptes du serveur (voir api_stats_service.py côté backend).
export default function ApiStatsSection() {
  const { t } = useTranslation(['admin', 'common']);
  const { api, user } = useAuth();
  const isSuperAdmin = user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;

  const [selfStats, setSelfStats] = useState([]);
  const [globalStats, setGlobalStats] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const selfRes = await api.get('/admin/api-stats/self');
      setSelfStats(selfRes.data);
    } catch (error) {
      toast.error(t('apiStats.toast.loadError'));
    }
    if (isSuperAdmin) {
      try {
        const globalRes = await api.get('/admin/api-stats/global');
        setGlobalStats(globalRes.data);
      } catch (error) {
        toast.error(t('apiStats.toast.loadError'));
      }
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, isSuperAdmin, t]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-api-stats-section">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" /> {t('page.apiStats')}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">{t('apiStats.subtitle')}</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" /> {t('apiStats.selfTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StatsTable rows={selfStats} t={t} showUser={false} />
        </CardContent>
      </Card>

      {isSuperAdmin && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" /> {t('apiStats.globalTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StatsTable rows={globalStats} t={t} showUser />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
