import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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
  FolderOpen,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  Loader2,
  Apple,
  Wine,
  Sparkles,
  SprayCan,
  Package,
} from 'lucide-react';

const iconMap = {
  Apple: Apple,
  Wine: Wine,
  Sparkles: Sparkles,
  SprayCan: SprayCan,
  Package: Package,
  FolderOpen: FolderOpen,
};

const iconOptions = [
  { value: 'Apple', label: 'Alimentaire' },
  { value: 'Wine', label: 'Boissons' },
  { value: 'Sparkles', label: 'Hygiène' },
  { value: 'SprayCan', label: 'Entretien' },
  { value: 'Package', label: 'Général' },
  { value: 'FolderOpen', label: 'Dossier' },
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

export default function CategoriesPage() {
  const { api } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    icon: 'Package',
    color: '#3B82F6',
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await api.get('/categories');
      setCategories(response.data);
    } catch (error) {
      toast.error('Erreur lors du chargement des catégories');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (category = null) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        name: category.name,
        icon: category.icon || 'Package',
        color: category.color || '#3B82F6',
      });
    } else {
      setEditingCategory(null);
      setFormData({
        name: '',
        icon: 'Package',
        color: '#3B82F6',
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Le nom de la catégorie est requis');
      return;
    }

    setSaving(true);
    try {
      if (editingCategory) {
        await api.put(`/categories/${editingCategory.id}`, formData);
        toast.success('Catégorie mise à jour');
      } else {
        await api.post('/categories', formData);
        toast.success('Catégorie créée');
      }
      setDialogOpen(false);
      fetchCategories();
    } catch (error) {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!categoryToDelete) return;

    try {
      await api.delete(`/categories/${categoryToDelete.id}`);
      toast.success('Catégorie supprimée');
      setDeleteDialogOpen(false);
      setCategoryToDelete(null);
      fetchCategories();
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
    <div className="space-y-6" data-testid="categories-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catégories</h1>
          <p className="text-muted-foreground mt-1">
            Organisez vos produits par catégories
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="btn-glow" data-testid="add-category-btn">
          <Plus className="w-4 h-4 mr-2" />
          Ajouter une catégorie
        </Button>
      </div>

      {/* Categories Grid */}
      {categories.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categories.map((category, index) => {
            const IconComponent = iconMap[category.icon] || Package;
            return (
              <Card
                key={category.id}
                className="bg-card border-border card-hover animate-fade-in"
                style={{ animationDelay: `${index * 0.05}s` }}
                data-testid={`category-card-${category.id}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className="p-3 rounded-xl"
                      style={{ backgroundColor: `${category.color}20` }}
                    >
                      <IconComponent
                        className="w-6 h-6"
                        style={{ color: category.color }}
                      />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`category-menu-${category.id}`}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenDialog(category)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setCategoryToDelete(category);
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
                  <h3 className="font-semibold text-lg">{category.name}</h3>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderOpen className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Aucune catégorie</h3>
            <p className="text-muted-foreground text-center mb-4">
              Créez des catégories pour organiser vos produits
            </p>
            <Button onClick={() => handleOpenDialog()} data-testid="add-first-category-btn">
              <Plus className="w-4 h-4 mr-2" />
              Ajouter une catégorie
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Modifier la catégorie' : 'Ajouter une catégorie'}
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
                data-testid="category-name-input"
              />
            </div>
            <div>
              <Label>Icône</Label>
              <div className="grid grid-cols-6 gap-2 mt-2">
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
                      data-testid={`icon-option-${option.value}`}
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
            <Button onClick={handleSave} disabled={saving} data-testid="save-category-btn">
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
            Êtes-vous sûr de vouloir supprimer la catégorie "{categoryToDelete?.name}" ?
            Les produits associés ne seront pas supprimés mais n'auront plus de catégorie.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} data-testid="confirm-delete-category-btn">
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
