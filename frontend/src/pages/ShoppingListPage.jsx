import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  ShoppingCart,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  Check,
  Package,
} from 'lucide-react';

export default function ShoppingListPage() {
  const { api } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Add item dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [newItemUnit, setNewItemUnit] = useState('unité');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const response = await api.get('/shopping-list');
      setItems(response.data);
    } catch (error) {
      toast.error('Erreur lors du chargement de la liste');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await api.get('/shopping-list/generate');
      setItems(response.data);
      toast.success('Liste de courses générée');
    } catch (error) {
      toast.error('Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleItem = async (item) => {
    try {
      const response = await api.patch(`/shopping-list/${item.id}/toggle`);
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, is_checked: response.data.is_checked } : i
        )
      );
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await api.delete(`/shopping-list/${itemId}`);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      toast.success('Article supprimé');
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleClearChecked = async () => {
    setClearing(true);
    try {
      await api.delete('/shopping-list?checked_only=true');
      setItems((prev) => prev.filter((i) => !i.is_checked));
      toast.success('Articles cochés supprimés');
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    } finally {
      setClearing(false);
    }
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) {
      toast.error("Le nom de l'article est requis");
      return;
    }

    setSaving(true);
    try {
      const response = await api.post('/shopping-list', {
        name: newItemName,
        quantity: newItemQuantity,
        unit: newItemUnit,
      });
      setItems((prev) => [...prev, response.data]);
      setAddDialogOpen(false);
      setNewItemName('');
      setNewItemQuantity(1);
      setNewItemUnit('unité');
      toast.success('Article ajouté');
    } catch (error) {
      toast.error("Erreur lors de l'ajout");
    } finally {
      setSaving(false);
    }
  };

  const uncheckedItems = items.filter((i) => !i.is_checked);
  const checkedItems = items.filter((i) => i.is_checked);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="shopping-list-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Liste de Courses</h1>
          <p className="text-muted-foreground mt-1">
            Gérez votre liste de courses
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleGenerate}
            disabled={generating}
            data-testid="generate-list-btn"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Générer
          </Button>
          <Button onClick={() => setAddDialogOpen(true)} className="btn-glow" data-testid="add-item-btn">
            <Plus className="w-4 h-4 mr-2" />
            Ajouter
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10">
              <ShoppingCart className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{uncheckedItems.length}</p>
              <p className="text-sm text-muted-foreground">À acheter</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10">
              <Check className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{checkedItems.length}</p>
              <p className="text-sm text-muted-foreground">Achetés</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Shopping List */}
      {items.length > 0 ? (
        <div className="space-y-6">
          {/* Unchecked Items */}
          {uncheckedItems.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">À acheter</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {uncheckedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    data-testid={`shopping-item-${item.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={item.is_checked}
                        onCheckedChange={() => handleToggleItem(item)}
                        data-testid={`check-item-${item.id}`}
                      />
                      <div className="flex items-center gap-2">
                        {item.product_id ? (
                          <Package className="w-4 h-4 text-primary" />
                        ) : null}
                        <span className="font-medium">{item.name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">
                        {item.quantity} {item.unit}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteItem(item.id)}
                        data-testid={`delete-item-${item.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Checked Items */}
          {checkedItems.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-semibold text-muted-foreground">
                  Achetés
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearChecked}
                  disabled={clearing}
                  className="text-muted-foreground hover:text-destructive"
                  data-testid="clear-checked-btn"
                >
                  {clearing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Supprimer les achetés
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {checkedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 opacity-60"
                    data-testid={`shopping-item-checked-${item.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={item.is_checked}
                        onCheckedChange={() => handleToggleItem(item)}
                      />
                      <span className="font-medium line-through">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">
                        {item.quantity} {item.unit}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteItem(item.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ShoppingCart className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Liste vide</h3>
            <p className="text-muted-foreground text-center mb-4">
              Générez automatiquement une liste à partir de vos produits en stock bas
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleGenerate} disabled={generating}>
                {generating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Générer la liste
              </Button>
              <Button onClick={() => setAddDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Ajouter manuellement
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Item Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Ajouter un article</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Nom *</label>
              <Input
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="bg-input border-border mt-1"
                placeholder="Ex: Lait, Pain..."
                data-testid="new-item-name-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Quantité</label>
                <Input
                  type="number"
                  min="1"
                  value={newItemQuantity}
                  onChange={(e) => setNewItemQuantity(parseInt(e.target.value) || 1)}
                  className="bg-input border-border mt-1"
                  data-testid="new-item-quantity-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Unité</label>
                <Input
                  value={newItemUnit}
                  onChange={(e) => setNewItemUnit(e.target.value)}
                  className="bg-input border-border mt-1"
                  placeholder="unité"
                  data-testid="new-item-unit-input"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleAddItem} disabled={saving} data-testid="save-new-item-btn">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Ajout...
                </>
              ) : (
                'Ajouter'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
