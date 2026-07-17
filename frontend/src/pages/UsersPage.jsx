import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
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
  active: { label: 'Actif', variant: 'success' },
  pending: { label: 'En attente', variant: 'warning' },
  disabled: { label: 'Désactivé', variant: 'destructive' },
};

export default function UsersPage() {
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
      toast.error("Erreur lors du chargement des utilisateurs");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (userId, status) => {
    setBusyId(userId);
    try {
      await api.patch(`/auth/users/${userId}/status`, { status });
      toast.success('Statut mis à jour');
      fetchUsers();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erreur lors de la mise à jour');
    } finally {
      setBusyId(null);
    }
  };

  const rejectPending = async (userId) => {
    setBusyId(userId);
    try {
      await api.delete(`/auth/users/${userId}`);
      toast.success('Inscription refusée');
      fetchUsers();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erreur lors du refus');
    } finally {
      setBusyId(null);
    }
  };

  const updateRole = async (userId, role) => {
    setBusyId(userId);
    try {
      await api.patch(`/auth/users/${userId}/role`, { role });
      toast.success('Rôle mis à jour');
      fetchUsers();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erreur lors de la mise à jour du rôle');
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
          <h1 className="text-3xl font-bold tracking-tight">Gestion des utilisateurs</h1>
          <p className="text-muted-foreground mt-1">
            {pendingCount > 0
              ? `${pendingCount} compte${pendingCount > 1 ? 's' : ''} en attente de validation`
              : 'Tous les comptes sont traités'}
          </p>
        </div>
        <Button variant="outline" onClick={fetchUsers} data-testid="refresh-users-btn">
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualiser
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
                    {isSelf && <Badge variant="secondary">Moi</Badge>}
                    <Badge variant={status.variant === 'success' ? 'default' : status.variant === 'warning' ? 'outline' : 'destructive'}>
                      {u.status === 'active' && <Check className="w-3 h-3 mr-1" />}
                      {u.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                      {status.label}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm mt-1">{u.email}</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    Login : {u.username} · Inscrit le{' '}
                    {new Date(u.created_at).toLocaleDateString('fr-FR')}
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
                          Approuver
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
                          Refuser
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
                            <SelectItem value="user">Utilisateur</SelectItem>
                            <SelectItem value="admin">Administrateur</SelectItem>
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
                          {u.status === 'disabled' ? 'Réactiver' : 'Désactiver'}
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
