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
  NotebookTabs,
} from 'lucide-react';

export default function ShoppingListPage() {
  const { api } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [newItemUnit, setNewItemUnit] = useState('unité');
  const [saving, setSaving] = useState(false);

  // Détection Apple / Android
  const isApple = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const response = await api.get('/shopping-list');
      setItems(response.data);
    } catch (error) {
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  // --- CORRECTION NOM DE FONCTION ---
  const handleExport = () => {
    const activeItems = items.filter(i => !i.is_checked);
    if (activeItems.length === 0) return toast.error("Liste vide");

    const listString = activeItems
      .map(i => `- ${i.name} (${i.quantity} ${i.unit})`)
      .join('\n');

    navigator.clipboard.writeText(listString).then(() => {
      if (isApple) {
        toast.success("Copié ! Collez dans Notes.");
        window.location.href = "mobilenotes://";
      } else if (isAndroid) {
        toast.success("Copié ! Collez dans Google Keep.");
        window.open("https://keep.google.com/#create", "_blank");
      } else {
        toast.success("Liste copiée !");
      }
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
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
      toast.success('Liste synchronisée');
    } catch (error) {
      toast.error('Erreur génération');
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

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin h-12 w-12 text-primary" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Liste de Courses</h1>
          <p className="text-muted-foreground mt-1 text-sm italic">Basé sur les stocks de groupes</p>
        </div>

        <div className="flex gap-2">
          {/* BOUTON EXPORT CONDITIONNEL */}
          {isApple && (
            <Button
              variant="outline"
              onClick={handleExport}
              className="bg-[#FFF9E6] border-[#E6B800] text-[#856404] hover:bg-[#FFF4A3]"
            >
              <Share className="w-4 h-4 mr-2" /> Notes
            </Button>
          )}

          {isAndroid && (
            <Button
              variant="outline"
              onClick={handleExport}
              className="bg-[#F2F2F2] border-[#5F6368] text-[#3C4043] hover:bg-[#E8EAED]"
            >
              <NotebookTabs className="w-4 h-4 mr-2 text-[#F4B400]" /> Keep
            </Button>
          )}

          <Button variant="outline" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Générer
          </Button>

          <Button onClick={() => setAddDialogOpen(true)} className="btn-glow">
            <Plus className="w-4 h-4 mr-2" /> Ajouter
          </Button>
        </div>
      </div>

      {/* Reste de ton UI (Stats, Cartes, etc.) inchangé... */}
      {/* ... (Items Mapping) ... */}
    </div>
  );
}