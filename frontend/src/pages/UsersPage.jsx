import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/formatters';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import {
  RefreshCw,
  Check,
  X,
  UserX,
  UserCheck,
  Clock,
} from 'lucide-react';

const STATUS_LABEL = {
  active: { labelKey: 'status.active', variant: 'success' },
  pending: { labelKey: 'status.pending', variant: 'warning' },
  disabled: { labelKey: 'status.disabled', variant: 'destructive' },
};

export default function UsersPage() {
  const { t } = useTranslation('users');
  const { api, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/auth/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast.error(t('errors.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (userId, status) => {
    setBusyId(userId);
    try {
      await api.patch(`/auth/users/${userId}/status`, { status });
      toast.success(t('statusUpdated'));
      fetchUsers();
    } catch (error) {
      toast.error(error?.response?.data?.detail || t('errors.updateStatusError'));
    } finally {
      setBusyId(null);
    }
  };

  const rejectPending = async (userId) => {
    setBusyId(userId);
    try {
      await api.delete(`/auth/users/${userId}`);
      toast.success(t('registrationRejected'));
      fetchUsers();
    } catch (error) {
      toast.error(error?.response?.data?.detail || t('errors.rejectError'));
    } finally {
      setBusyId(null);
    }
  };

  const updateRole = async (userId, role) => {
    setBusyId(userId);
    try {
      await api.patch(`/auth/users/${userId}/role`, { role });
      toast.success(t('roleUpdated'));
      fetchUsers();
    } catch (error) {
      toast.error(error?.response?.data?.detail || t('errors.updateRoleError'));
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = users.filter((u) => u.status === 'pending').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="users-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('page.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {pendingCount > 0
              ? t('page.pendingCount', { count: pendingCount })
              : t('page.allProcessed')}
          </p>
        </div>
        <Button variant="outline" onClick={fetchUsers} data-testid="refresh-users-btn">
          <RefreshCw className="w-4 h-4 mr-2" />
          {t('page.refresh')}
        </Button>
      </div>

      <div className="space-y-4">
        {users.map((u) => {
          const isSelf = u.id === user?.id;
          const status = STATUS_LABEL[u.status] || STATUS_LABEL.pending;

          return (
            <Card key={u.id} className="bg-card border-border" data-testid={`user-row-${u.id}`}>
              <CardContent className="p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold">{u.username}</h3>
                    {isSelf && <Badge variant="secondary">{t('self')}</Badge>}
                    <Badge variant={status.variant === 'success' ? 'default' : status.variant === 'warning' ? 'outline' : 'destructive'}>
                      {u.status === 'active' && <Check className="w-3 h-3 mr-1" />}
                      {u.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                      {t(status.labelKey)}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm mt-1">{u.email}</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    {t('loginLine', { username: u.username, date: formatDate(u.created_at) })}
                  </p>
                </div>

                {!isSelf && (
                  <div className="flex items-center gap-3 flex-wrap">
                    {u.status === 'pending' ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => updateStatus(u.id, 'active')}
                          disabled={busyId === u.id}
                          data-testid={`approve-user-${u.id}`}
                        >
                          <UserCheck className="w-4 h-4 mr-2" />
                          {t('approve')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => rejectPending(u.id)}
                          disabled={busyId === u.id}
                          data-testid={`reject-user-${u.id}`}
                        >
                          <X className="w-4 h-4 mr-2" />
                          {t('reject')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Select
                          value={u.role}
                          onValueChange={(value) => updateRole(u.id, value)}
                          disabled={busyId === u.id}
                        >
                          <SelectTrigger className="w-[180px]" data-testid={`role-select-${u.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">{t('roles.user')}</SelectItem>
                            <SelectItem value="admin">{t('roles.admin')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => updateStatus(u.id, u.status === 'disabled' ? 'active' : 'disabled')}
                          disabled={busyId === u.id}
                          data-testid={`toggle-status-${u.id}`}
                        >
                          <UserX className="w-4 h-4 mr-2" />
                          {u.status === 'disabled' ? t('reactivate') : t('deactivate')}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
