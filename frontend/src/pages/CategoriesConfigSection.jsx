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
  PawPrint,
} from 'lucide-react';

const iconMap = {
  Apple: Apple,
  Wine: Wine,
  Sparkles: Sparkles,
  SprayCan: SprayCan,
  Package: Package,
  FolderOpen: FolderOpen,
  PawPrint: PawPrint,
};

const getIconOptions = (t) => [
  { value: 'Apple', label: t('categories.icons.food') },
  { value: 'Wine', label: t('categories.icons.beverages') },
  { value: 'Sparkles', label: t('categories.icons.hygiene') },
  { value: 'SprayCan', label: t('categories.icons.cleaning') },
  { value: 'Package', label: t('categories.icons.general') },
  { value: 'PawPrint', label: t('categories.icons.animals') },
  { value: 'FolderOpen', label: t('categories.icons.folder') },
];

const getColorOptions = (t) => [
  { value: '#10B981', label: t('categories.colors.green') },
  { value: '#3B82F6', label: t('categories.colors.blue') },
  { value: '#8B5CF6', label: t('categories.colors.purple') },
  { value: '#F59E0B', label: t('categories.colors.orange') },
  { value: '#EF4444', label: t('categories.colors.red') },
  { value: '#6B7280', label: t('categories.colors.gray') },
  { value: '#EC4899', label: t('categories.colors.pink') },
  { value: '#14B8A6', label: t('categories.colors.turquoise') },
];

// Section "Catégories" de la page Configuration (voir ConfigurationPage.jsx).
// Anciennement une page à part entière (/categories) ; logique inchangée,
// seul l'en-tête pleine page a été retiré (déjà géré par le shell).
export default function CategoriesConfigSection() {
  const { t } = useTranslation(['configuration', 'common']);
  const { api } = useAuth();
  const iconOptions = getIconOptions(t);
  const colorOptions = getColorOptions(t);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [saving, setSaving] = useState(false);

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
      toast.error(t('categories.toast.loadError'));
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
      toast.error(t('categories.toast.nameRequired'));
      return;
    }

    setSaving(true);
    try {
      if (editingCategory) {
        const encodedId = encodeURIComponent(editingCategory.id);
        await api.put(`/categories/${encodedId}`, formData);
        toast.success(t('categories.toast.updated'));
      } else {
        await api.post('/categories', formData);
        toast.success(t('categories.toast.created'));
      }
      setDialogOpen(false);
      await fetchCategories();
    } catch (error) {
      console.error(error);
      toast.error(t('common:errors.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!categoryToDelete) return;

    try {
      const encodedId = encodeURIComponent(categoryToDelete.id);
      await api.delete(`/categories/${encodedId}`);
      toast.success(t('categories.toast.deleted'));
      setDeleteDialogOpen(false);
      setCategoryToDelete(null);
      fetchCategories();
    } catch (error) {
      toast.error(t('categories.toast.deleteError'));
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
    <div className="space-y-6" data-testid="config-categories-section">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{t('categories.title')}</h2>
          <p className="text-muted-foreground text-sm mt-1">{t('categories.subtitle')}</p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="btn-glow">
          <Plus className="w-4 h-4 mr-2" />
          {t('categories.addButton')}
        </Button>
      </div>

      {categories.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((category, index) => {
            const IconComponent = iconMap[category.icon] || Package;
            return (
              <Card key={category.id} className="bg-card border-border card-hover animate-fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className="p-3 rounded-xl"
                      style={{ backgroundColor: `${category.color || '#3B82F6'}20` }}
                    >
                      <IconComponent
                        className="w-6 h-6"
                        style={{ color: category.color || '#3B82F6' }}
                      />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenDialog(category)}>
                          <Edit className="w-4 h-4 mr-2" />
                          {t('common:actions.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setCategoryToDelete(category); setDeleteDialogOpen(true); }} className="text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" />
                          {t('common:actions.delete')}
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
        <Card className="bg-card border-border py-16 text-center">
            <FolderOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('categories.empty.title')}</h3>
            <Button onClick={() => handleOpenDialog()} className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              {t('categories.addButton')}
            </Button>
        </Card>
      )}

      {/* Dialog Ajout/Edition */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editingCategory ? t('categories.dialog.editTitle') : t('categories.dialog.addTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="category-name">{t('categories.dialog.nameLabel')}</Label>
              <Input id="category-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-input border-border" />
            </div>
            <div>
              <Label>{t('categories.dialog.iconLabel')}</Label>
              <div className="grid grid-cols-6 gap-2 mt-2">
                {iconOptions.map((option) => {
                  const Icon = iconMap[option.value];
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, icon: option.value })}
                      className={`p-3 rounded-lg border transition-colors ${formData.icon === option.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
                    >
                      <Icon className="w-5 h-5 mx-auto" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>{t('categories.dialog.colorLabel')}</Label>
              <div className="grid grid-cols-8 gap-2 mt-2">
                {colorOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, color: option.value })}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${formData.color === option.value ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
                    style={{ backgroundColor: option.value }}
                  />
                ))}
              </div>
            </div>
            <div className="pt-4 border-t border-border">
              <Label>{t('categories.dialog.previewLabel')}</Label>
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
                  {formData.name || t('categories.dialog.previewPlaceholder')}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common:actions.cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('common:status.saving')}</> : t('common:actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Suppression */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{t('categories.deleteDialog.title')}</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">{t('categories.deleteDialog.message', { name: categoryToDelete?.name })}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>{t('common:actions.cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete}>{t('common:actions.delete')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
