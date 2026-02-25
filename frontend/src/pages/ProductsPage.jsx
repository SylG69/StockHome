import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import {
  Package, Plus, Search, MoreVertical, Edit, Trash2,
  Minus, AlertTriangle, Loader2
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "../components/ui/accordion";

export default function ProductsPage() {
  const { api } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saving, setSaving] = useState(false);

  const initialForm = {
    name: '',
    quantity: 0,
    unit: 'unité',
    sub_category_id: null,
    location_id: null,
    brand: ''
  };
  const [formData, setFormData] = useState(initialForm);

  const fetchData = async () => {
    try {
      const [pRes, cRes, lRes] = await Promise.all([
        api.get('/products'),
        api.get('/categories'),
        api.get('/locations')
      ]);
      setProducts(pRes.data || []);
      setCategories(cRes.data || []);
      setLocations(lRes.data || []);
    } catch (error) {
      toast.error("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // --- CALCULS SÉCURISÉS (Empêchent l'écran noir) ---
  const subCategories = useMemo(() => {
    return (categories || []).flatMap(c => c.sub_categories || c.subcategories || []);
  }, [categories]);

  const filteredProducts = products.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.brand?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedProducts = filteredProducts.reduce((acc, p) => {
    const subId = p.sub_category_id || 'none';
    if (!acc[subId]) acc[subId] = { items: [], total: 0 };
    acc[subId].items.push(p);
    acc[subId].total += Number(p.quantity || 0);
    return acc;
  }, {});

  // --- ACTIONS ---
  const handleUpdateThreshold = async (subId, value) => {
    const min_stock = parseInt(value, 10);
    if (isNaN(min_stock)) return;
    try {
      await api.patch(`/subcategories/${encodeURIComponent(subId)}/threshold`, { min_stock });
      toast.success("Seuil mis à jour");
      fetchData();
    } catch (e) { toast.error("Erreur de sauvegarde"); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingProduct) {
        await api.put(`/products/${encodeURIComponent(editingProduct.id)}`, formData);
      } else {
        await api.post('/products', formData);
      }
      setDialogOpen(false);
      fetchData();
      toast.success("Enregistré");
    } catch (e) { toast.error("Erreur"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="p-4 pb-20 max-w-4xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="text-primary" /> Stock</h1>
        <Button onClick={() => { setEditingProduct(null); setFormData(initialForm); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Nouveau
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder="Rechercher..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <Accordion type="multiple" className="space-y-2">
        {Object.entries(groupedProducts).map(([subId, data]) => {
          const sub = subCategories.find(s => s.id === subId) || { name: "Sans catégorie", min_stock: 0 };
          const isLow = data.total <= (sub.min_stock || 0);

          return (
            <AccordionItem key={subId} value={subId} className="border rounded-lg bg-card px-2">
              <div className="flex items-center">
                <AccordionTrigger className="flex-1 hover:no-underline py-4">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{sub.name}</span>
                    <Badge variant={isLow ? "destructive" : "secondary"}>{data.total} en stock</Badge>
                  </div>
                </AccordionTrigger>

                <div className="flex items-center gap-2 mr-4 bg-muted/50 p-1 rounded border">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground px-1">Seuil :</Label>
                  <input
                    type="number"
                    className="w-10 bg-transparent text-xs font-bold focus:outline-none"
                    defaultValue={sub.min_stock || 0}
                    onBlur={(e) => handleUpdateThreshold(subId, e.target.value)}
                  />
                </div>
              </div>

              <AccordionContent className="pt-0 pb-4 space-y-2">
                {data.items.map(product => (
                  <div key={product.id} className="flex justify-between items-center p-3 bg-muted/20 rounded-lg border border-border/50">
                    <div>
                      <p className="font-medium text-sm">{product.name}</p>
                      <p className="text-[10px] text-muted-foreground">{product.brand}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-sm">{product.quantity} {product.unit}</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                        setEditingProduct(product);
                        setFormData(product);
                        setDialogOpen(true);
                      }}><Edit className="w-4 h-4" /></Button>
                    </div>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingProduct ? 'Modifier' : 'Ajouter'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>Nom</Label><Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Quantité</Label><Input type="number" value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 0})} /></div>
              <div>
                <Label>Sous-catégorie</Label>
                <Select value={formData.sub_category_id || "none"} onValueChange={v => setFormData({...formData, sub_category_id: v === "none" ? null : v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune</SelectItem>
                    {subCategories.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : "Enregistrer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}