import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  MapPin,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  Loader2,
  Home,
  Snowflake,
  Bath,
  Warehouse,
  ChefHat,
  Car,
} from 'lucide-react';

const iconMap = {
  Home: Home,
  ChefHat: ChefHat,
  Snowflake: Snowflake,
  Bath: Bath,
  Warehouse: Warehouse,
  MapPin: MapPin,
  Car: Car,
};

const getIconOptions = (t) => [
  { value: 'Home', label: t('locations.icons.home') },
  { value: 'ChefHat', label: t('locations.icons.kitchen') },
  { value: 'Snowflake', label: t('locations.icons.fridge') },
  { value: 'Bath', label: t('locations.icons.bathroom') },
  { value: 'Warehouse', label: t('locations.icons.garage') },
  { value: 'Car', label: t('locations.icons.car') },
  { value: 'MapPin', label: t('locations.icons.other') },
];

const getColorOptions = (t) => [
  { value: '#10B981', label: t('locations.colors.green') },
  { value: '#3B82F6', label: t('locations.colors.blue') },
  { value: '#8B5CF6', label: t('locations.colors.purple') },
  { value: '#F59E0B', label: t('locations.colors.orange') },
  { value: '#EF4444', label: t('locations.colors.red') },
  { value: '#6B7280', label: t('locations.colors.gray') },
  { value: '#EC4899', label: t('locations.colors.pink') },
  { value: '#14B8A6', label: t('locations.colors.turquoise') },
];

// Section "Emplacements" de la page Configuration (voir ConfigurationPage.jsx).
// Anciennement une page à part entière (/locations). Deux bugs corrigés au
// passage lors de la fusion :
// 1. handleOpenDialog ne renseignait jamais `color` dans formData (il
//    écrasait tout l'objet au lieu de le compléter) -- la couleur choisie
//    n'était donc jamais restaurée à l'édition, ni vraiment enregistrable.
// 2. L'aperçu utilisait un fallback sur l'icône "Package", jamais importée
//    dans ce fichier (aurait provoqué une erreur si jamais atteint) --
//    remplacé par MapPin, cohérent avec le reste du fichier.
export default function LocationsConfigSection() {
  const { t } = useTranslation(['configuration', 'common']);
  const { api } = useAuth();
  const iconOptions = getIconOptions(t);
  const colorOptions = getColorOptions(t);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [locationToDelete, setLocationToDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: 'Home',
    color: '#3B82F6',
  });

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const response = await api.get('/locations');
      setLocations(response.data);
    } catch (error) {
      console.error('Erreur fetch:', error);
      toast.error(t('locations.toast.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (location = null) => {
    if (location) {
      setEditingLocation(location);
      setFormData({
        name: location.name,
        description: location.description || '',
        icon: location.icon || 'Home',
        color: location.color || '#3B82F6',
      });
    } else {
      setEditingLocation(null);
      setFormData({
        name: '',
        description: '',
        icon: 'Home',
        color: '#3B82F6',
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error(t('locations.toast.nameRequired'));
      return;
    }

    setSaving(true);
    try {
      if (editingLocation) {
        const encodedId = encodeURIComponent(editingLocation.id);
        await api.put(`/locations/${encodedId}`, formData);
        toast.success(t('locations.toast.updated'));
      } else {
        await api.post('/locations', formData);
        toast.success(t('locations.toast.created'));
      }
      setDialogOpen(false);
      await fetchLocations();
    } catch (error) {
      console.error(error);
      toast.error(t('common:errors.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!locationToDelete) return;

    try {
      const encodedId = encodeURIComponent(locationToDelete.id);
      await api.delete(`/locations/${encodedId}`);
      toast.success(t('locations.toast.deleted'));
      setDeleteDialogOpen(false);
      setLocationToDelete(null);
      fetchLocations();
    } catch (error) {
      toast.error(t('locations.toast.deleteError'));
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
    <div className="space-y-6" data-testid="config-locations-section">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{t('locations.title')}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {t('locations.subtitle')}
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="btn-glow" data-testid="add-location-btn">
          <Plus className="w-4 h-4 mr-2" />
          {t('locations.addButton')}
        </Button>
      </div>

      {locations.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map((location, index) => {
            const IconComponent = iconMap[location.icon] || MapPin;
            return (
              <Card
                key={location.id}
                className="bg-card border-border card-hover animate-fade-in"
                style={{ animationDelay: `${index * 0.05}s` }}
                data-testid={`location-card-${location.id}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className="p-3 rounded-xl"
                      style={{ backgroundColor: `${location.color || '#3B82F6'}20` }}
                    >
                      <IconComponent
                        className="w-6 h-6"
                        style={{ color: location.color || '#3B82F6' }}
                      />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`location-menu-${location.id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenDialog(location)}>
                          <Edit className="w-4 h-4 mr-2" />
                          {t('common:actions.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setLocationToDelete(location);
                            setDeleteDialogOpen(true);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {t('common:actions.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <h3 className="font-semibold text-lg">{location.name}</h3>
                    {location.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {location.description}
                      </p>
                    )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <MapPin className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('locations.empty.title')}</h3>
            <p className="text-muted-foreground text-center mb-4">
              {t('locations.empty.description')}
            </p>
            <Button onClick={() => handleOpenDialog()} data-testid="add-first-location-btn">
              <Plus className="w-4 h-4 mr-2" />
              {t('locations.addButton')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>
              {editingLocation ? t('locations.dialog.editTitle') : t('locations.dialog.addTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="location-name">{t('locations.dialog.nameLabel')}</Label>
              <Input
                id="location-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-input border-border"
                data-testid="location-name-input"
              />
            </div>
            <div>
              <Label htmlFor="location-description">{t('locations.dialog.descriptionLabel')}</Label>
              <Input
                id="location-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-input border-border"
                placeholder={t('locations.dialog.descriptionPlaceholder')}
                data-testid="location-description-input"
              />
            </div>
            <div>
              <Label>{t('locations.dialog.iconLabel')}</Label>
              <div className="grid grid-cols-7 gap-2 mt-2">
                {iconOptions.map((option) => {
                  const Icon = iconMap[option.value];
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, icon: option.value })}
                      className={`p-3 rounded-lg border transition-colors ${
                        formData.icon === option.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      }`}
                      title={option.label}
                      data-testid={`location-icon-${option.value}`}
                    >
                      <Icon className="w-5 h-5 mx-auto" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>{t('locations.dialog.colorLabel')}</Label>
              <div className="grid grid-cols-8 gap-2 mt-2">
                {colorOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, color: option.value })}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${
                      formData.color === option.value
                        ? 'border-white scale-110'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: option.value }}
                    data-testid={`color-option-${option.value}`}
                  />
                ))}
              </div>
            </div>
            {/* Preview */}
            <div className="pt-4 border-t border-border">
              <Label>{t('locations.dialog.previewLabel')}</Label>
              <div className="flex items-center gap-3 mt-2 p-4 rounded-lg bg-secondary/50">
                <div
                  className="p-3 rounded-xl"
                  style={{ backgroundColor: `${formData.color}20` }}
                >
                  {(() => {
                    const Icon = iconMap[formData.icon] || MapPin;
                    return <Icon className="w-6 h-6" style={{ color: formData.color }} />;
                  })()}
                </div>
                <span className="font-semibold">
                  {formData.name || t('locations.dialog.previewPlaceholder')}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving} data-testid="save-location-btn">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('common:status.saving')}
                </>
              ) : (
                t('common:actions.save')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{t('locations.deleteDialog.title')}</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            {t('locations.deleteDialog.message', { name: locationToDelete?.name })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} data-testid="confirm-delete-location-btn">
              {t('common:actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
