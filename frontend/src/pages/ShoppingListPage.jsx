import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
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
  Layers,
  Share,
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

  // --- NOUVELLE FONCTION D'EXPORT ---
  const handleExport = () => {
    const activeItems = items.filter(i => !i.is_checked);

    if (activeItems.length === 0) {
      toast.error("La liste est vide");
      return;
    }

    // Formatage : "Nom de l'article (Quantité Unité)"
    const listString = activeItems
      .map(i => `- ${i.name} (${i.quantity} ${i.unit})`)
      .join('\n');

    navigator.clipboard.writeText(listString)
      .then(() => {
        toast.success("Liste copiée !");
        window.location.href = "x-apple-reminder://";
      })
      .catch(() => {
        toast.error("Erreur lors de la copie");
      });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // Logique basée sur les sous-catégories (Seuil - Stock Total)
      const [productsRes, subCatsRes] = await Promise.all([
        api.get('/products'),
        api.get('/subcategories')
      ]);

      const products = productsRes.data;
      const subCategories = subCatsRes.data;

      const stockPerSubCat = products.reduce((acc, p) => {
        if (!p.sub_category_id) return acc;
        acc[p.sub_category_id] = (acc[p.sub_category_id] || 0) + p.quantity;
        return acc;
      }, {});

      const missingItems = subCategories
        .filter(sub => (stockPerSubCat[sub.id] || 0) < (sub.min_quantity || 0))
        .map(sub => ({
          name: sub.name,
          quantity: sub.min_quantity - (stockPerSubCat[sub.id] || 0),
          unit: 'unité'
        }));

      for (const item of missingItems) {
        if (!items.find(ex => ex.name === item.name && !ex.is_checked)) {
          await api.post('/shopping-list', item);
        }
      }

      fetchItems();
      toast.success('Liste synchronisée avec les seuils de groupes');
    } catch (error) {
      toast.error('Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleItem = async (item) => {
    try {
      const response = await api.patch(`/shopping-list/${item.id}/toggle`);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_checked: response.data.is_checked } : i));
    } catch (error) { toast.error('Erreur'); }
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await api.delete(`/shopping-list/${itemId}`);
      setItems(prev => prev.filter(i => i.id !== itemId));
    } catch (error) { toast.error('Erreur'); }
  };

  const handleClearChecked = async () => {
    setClearing(true);
    try {
      await api.delete('/shopping-list?checked_only=true');
      setItems(prev => prev.filter(i => !i.is_checked));
      toast.success('Panier vidé');
    } catch (error) { toast.error('Erreur'); } finally { setClearing(false); }
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) return;
    setSaving(true);
    try {
      const response = await api.post('/shopping-list', { name: newItemName, quantity: newItemQuantity, unit: newItemUnit });
      setItems(prev => [...prev, response.data]);
      setAddDialogOpen(false);
      setNewItemName('');
    } catch (error) { toast.error('Erreur'); } finally { setSaving(false); }
  };

  const uncheckedItems = items.filter((i) => !i.is_checked);
  const checkedItems = items.filter((i) => i.is_checked);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin h-12 w-12 text-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* Header avec bouton EXPORT */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Liste de Courses</h1>
          <p className="text-muted-foreground mt-1">Gérée par groupes de produits</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} className="border-primary/20 hover:bg-primary/5 text-primary">
            <Share className="w-4 h-4 mr-2" />
            Exporter
          </Button>
          <Button variant="outline" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Générer
          </Button>
          <Button onClick={() => setAddDialogOpen(true)} className="btn-glow">
            <Plus className="w-4 h-4 mr-2" />
            Ajouter
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-card border-border"><CardContent className="p-4 flex items-center gap-4"><div className="p-3 rounded-xl bg-primary/10"><ShoppingCart className="w-6 h-6 text-primary" /></div><div><p className="text-2xl font-bold">{uncheckedItems.length}</p><p className="text-sm text-muted-foreground">À acheter</p></div></CardContent></Card>
        <Card className="bg-card border-border"><CardContent className="p-4 flex items-center gap-4"><div className="p-3 rounded-xl bg-emerald-500/10"><Check className="w-6 h-6 text-emerald-500" /></div><div><p className="text-2xl font-bold">{checkedItems.length}</p><p className="text-sm text-muted-foreground">Panier</p></div></CardContent></Card>
      </div>

      {/* List content */}
      {items.length > 0 ? (
        <div className="space-y-6">
          {uncheckedItems.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-lg font-semibold">Besoins identifiés</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {uncheckedItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Checkbox checked={item.is_checked} onCheckedChange={() => handleToggleItem(item)} />
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{item.name}</span>
                        <Badge variant="secondary" className="text-[9px] uppercase"><Layers className="w-2 h-2 mr-1" /> Groupe</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">{item.quantity} {item.unit}</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteItem(item.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {checkedItems.length > 0 && (
            <Card className="bg-card border-border opacity-60">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Dans le panier</CardTitle>
                <Button variant="ghost" size="sm" onClick={handleClearChecked} disabled={clearing} className="text-xs">Vider le panier</Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {checkedItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/10">
                    <div className="flex items-center gap-3">
                      <Checkbox checked={item.is_checked} onCheckedChange={() => handleToggleItem(item)} />
                      <span className="font-medium line-through text-muted-foreground">{item.name}</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card className="bg-card border-border border-dashed py-16 text-center">
            <ShoppingCart className="w-16 h-16 mx-auto text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground">Tout est en stock !</p>
        </Card>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Ajouter manuellement</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <Input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="Nom de l'article..." />
            <div className="grid grid-cols-2 gap-4">
              <Input type="number" value={newItemQuantity} onChange={e => setNewItemQuantity(parseInt(e.target.value) || 1)} />
              <Input value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)} placeholder="Unité" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddItem} disabled={saving}>Ajouter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}