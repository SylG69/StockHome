import { useState, useEffect } from 'react';
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

const iconOptions = [
  { value: 'Home', label: 'Maison' },
  { value: 'ChefHat', label: 'Cuisine' },
  { value: 'Snowflake', label: 'Réfrigérateur' },
  { value: 'Bath', label: 'Salle de bain' },
  { value: 'Warehouse', label: 'Garage' },
  { value: 'Car', label: 'Voiture' },
  { value: 'MapPin', label: 'Autre' },
];

const colorOptions = [
  { value: '#10B981', label: 'Vert' },
  { value: '#3B82F6', label: 'Bleu' },
  { value: '#8B5CF6', label: 'Violet' },
  { value: '#F59E0B', label: 'Orange' },
  { value: '#EF4444', label: 'Rouge' },
  { value: '#6B7280', label: 'Gris' },
  { value: '#EC4899', label: 'Rose' },
  { value: '#14B8A6', label: 'Turquoise' },
];

export default function LocationsPage() {
  const { api } = useAuth();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [locationToDelete, setLocationToDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
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
    setLoading(true); // Optionnel : afficher un loader pendant le rafraîchissement
    try {
      const response = await api.get('/locations');
      // On met à jour l'état avec les données fraîches de DynamoDB
      setLocations(response.data);
    } catch (error) {
      console.error('Erreur fetch:', error);
      toast.error('Erreur lors du chargement des emplacements');
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
      });
    } else {
      setEditingLocation(null);
      setFormData({
        name: '',
        description: '',
        icon: 'Home',
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Le nom de l'emplacement est requis");
      return;
    }

    setSaving(true);
    try {
      if (editingLocation) {
        // Utilisation de encodeURIComponent pour gérer le '#' dans l'ID
        const encodedId = encodeURIComponent(editingLocation.id);
        await api.put(`/locations/${encodedId}`, formData);
        toast.success('Emplacement mis à jour');
      } else {
        await api.post('/locations', formData);
        toast.success('Emplacement créé');
      }
      setDialogOpen(false);
      await fetchLocations();
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!locationToDelete) return;

    try {
      const encodedId = encodeURIComponent(locationToDelete.id);
      await api.delete(`/locations/${encodedId}`);
      toast.success('Emplacement supprimé');
      setDeleteDialogOpen(false);
      setLocationToDelete(null);
      fetchLocations();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
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
    <div className="space-y-6" data-testid="locations-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Emplacements</h1>
          <p className="text-muted-foreground mt-1">
            Gérez les emplacements de stockage
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="btn-glow" data-testid="add-location-btn">
          <Plus className="w-4 h-4 mr-2" />
          Ajouter un emplacement
        </Button>
      </div>

      {/* Locations Grid */}
      {locations.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setLocationToDelete(location);
                            setDeleteDialogOpen(true);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Supprimer
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
            <h3 className="text-lg font-semibold mb-2">Aucun emplacement</h3>
            <p className="text-muted-foreground text-center mb-4">
              Créez des emplacements pour organiser vos produits
            </p>
            <Button onClick={() => handleOpenDialog()} data-testid="add-first-location-btn">
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un emplacement
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>
              {editingLocation ? "Modifier l'emplacement" : 'Ajouter un emplacement'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Nom *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-input border-border"
                data-testid="location-name-input"
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-input border-border"
                placeholder="Description optionnelle"
                data-testid="location-description-input"
              />
            </div>
            <div>
              <Label>Icône</Label>
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
              <Label>Couleur</Label>
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
              <Label>Aperçu</Label>
              <div className="flex items-center gap-3 mt-2 p-4 rounded-lg bg-secondary/50">
                <div
                  className="p-3 rounded-xl"
                  style={{ backgroundColor: `${formData.color}20` }}
                >
                  {(() => {
                    const Icon = iconMap[formData.icon] || Package;
                    return <Icon className="w-6 h-6" style={{ color: formData.color }} />;
                  })()}
                </div>
                <span className="font-semibold">
                  {formData.name || 'Nom de la catégorie'}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving} data-testid="save-location-btn">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                'Enregistrer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer l'emplacement "{locationToDelete?.name}" ?
            Les produits associés ne seront pas supprimés mais n'auront plus d'emplacement.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} data-testid="confirm-delete-location-btn">
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
