import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  Package,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Minus,
  AlertTriangle,
  ScanLine,
  Loader2,
  Settings2,
} from 'lucide-react';
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";

export default function ProductsPage() {
  const { api } = useAuth();
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);

  // Formulaire complet
  const initialForm = {
    name: '',
    barcode: '',
    quantity: 0,
    unit: 'unité',
    brand: '',
    category_id: null,
    sub_category_id: null,
    location_id: null,
    image_url: ''
  };
  const [formData, setFormData] = useState(initialForm);

  // --- RÉCUPÉRATION DONNÉES ---
  const fetchData = async () => {
    try {
      setLoading(true);
      const [pRes, cRes, lRes] = await Promise.all([
        api.get('/products'),
        api.get('/categories'),
        api.get('/locations')
      ]);
      setProducts(pRes.data);
      setCategories(cRes.data);
      setLocations(lRes.data);
    } catch (error) {
      toast.error("Erreur de synchronisation");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // --- VARIABLES DE CALCUL (Indispensables pour éviter l'écran noir) ---
  const subCategories = (categories || []).flatMap(c => c.sub_categories || c.subcategories || []);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.brand && p.brand.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const groupedProducts = filteredProducts.reduce((acc, p) => {
    const subId = p.sub_category_id || 'none';
    if (!acc[subId]) acc[subId] = { items: [], total: 0 };
    acc[subId].items.push(p);
    acc[subId].total += (p.quantity || 0);
    return acc;
  }, {});

  // --- ACTIONS ---
  const handleUpdateThreshold = async (subId, value) => {
    const val = parseInt(value, 10);
    if (isNaN(val)) return;
    try {
      await api.patch(`/subcategories/${encodeURIComponent(subId)}/threshold`, { min_stock: val });
      toast.success("Seuil mis à jour");
      fetchData();
    } catch (e) { toast.error("Erreur seuil"); }
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
      toast.success("Stock mis à jour");
    } catch (e) { toast.error("Erreur de sauvegarde"); }
    finally { setSaving(false); }
  };

  const updateQty = async (id, delta) => {
    try {
      await api.patch(`/products/${encodeURIComponent(id)}/quantity`, { delta });
      // On met à jour localement pour la réactivité avant le refresh
      fetchData();
    } catch (e) { toast.error("Erreur quantité"); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/products/${encodeURIComponent(productToDelete.id)}`);
      setDeleteDialogOpen(false);
      fetchData();
      toast.success("Supprimé");
    } catch (e) { toast.error("Erreur"); }
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="animate-spin text-primary w-10 h-10" /></div>;

  return (
    <div className="p-4 pb-24 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <Package className="text-primary" /> Inventaire
        </h1>
        <Button onClick={() => { setEditingProduct(null); setFormData(initialForm); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Ajouter
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder="Rechercher un produit ou une marque..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <Accordion type="multiple" defaultValue={Object.keys(groupedProducts)} className="space-y-4">
        {Object.entries(groupedProducts).map(([subId, data]) => {
          const sub = subCategories.find(s => s.id === subId) || { name: "Non classé", min_stock: 0 };
          const isLow = data.total <= (sub.min_stock || 0);

          return (
            <AccordionItem key={subId} value={subId} className="border rounded-xl bg-card shadow-sm border-border overflow-hidden">
              <div className="flex items-center pr-4 bg-muted/20">
                <AccordionTrigger className="flex-1 px-4 py-4 hover:no-underline">
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-bold">{sub.name}</span>
                    <Badge variant={isLow ? "destructive" : "secondary"} className="font-mono">
                      {data.total}
                    </Badge>
                  </div>
                </AccordionTrigger>

                <div className="flex items-center gap-2 bg-background/80 px-3 py-1.5 rounded-full border border-border shadow-sm">
                  <AlertTriangle className={`h-3.5 w-3.5 ${isLow ? "text-destructive" : "text-muted-foreground"}`} />
                  <span className="text-[10px] font-black uppercase text-muted-foreground">Seuil</span>
                  <input
                    type="number"
                    className="w-8 bg-transparent text-center text-sm font-bold focus:outline-none"
                    defaultValue={sub.min_stock || 0}
                    onBlur={e => handleUpdateThreshold(subId, e.target.value)}
                  />
                </div>
              </div>

              <AccordionContent className="p-2 space-y-2">
                {data.items.map(product => (
                  <div key={product.id} className="flex items-center justify-between p-3 rounded-lg bg-background border border-border/50 group transition-all hover:border-primary/50">
                    <div className="flex items-center gap-4">
                      {product.image_url ? (
                        <img src={product.image_url} className="h-12 w-12 rounded-md object-cover border border-border" />
                      ) : (
                        <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center text-muted-foreground"><Package size={20}/></div>
                      )}
                      <div>
                        <h4 className="font-semibold leading-none">{product.name}</h4>
                        <p className="text-xs text-muted-foreground mt-1">{product.brand || 'Générique'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center bg-muted rounded-md p-1 border">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateQty(product.id, -1)}><Minus size={14}/></Button>
                        <span className="w-10 text-center font-bold text-sm">{product.quantity}</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateQty(product.id, 1)}><Plus size={14}/></Button>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="rounded-full"><MoreVertical size={16}/></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditingProduct(product); setFormData(product); setDialogOpen(true); }}>
                            <Edit className="mr-2 h-4 w-4" /> Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => { setProductToDelete(product); setDeleteDialogOpen(true); }}>
                            <Trash2 className="mr-2 h-4 w-4" /> Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* MODAL AJOUT / MODIF (Restauré avec tous les champs) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{editingProduct ? "Éditer le produit" : "Nouveau produit"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-2">
              <Label>Nom du produit *</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Quantité</Label>
              <Input type="number" value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 0})} />
            </div>
            <div className="space-y-2">
              <Label>Unité</Label>
              <Input value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} placeholder="ex: kg, pack, boîte" />
            </div>
            <div className="space-y-2">
              <Label>Sous-catégorie</Label>
              <Select value={formData.sub_category_id || "none"} onValueChange={v => setFormData({...formData, sub_category_id: v === "none" ? null : v})}>
                <SelectTrigger><SelectValue placeholder="Catégorie..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune</SelectItem>
                  {subCategories.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Emplacement</Label>
              <Select value={formData.location_id || "none"} onValueChange={v => setFormData({...formData, location_id: v === "none" ? null : v})}>
                <SelectTrigger><SelectValue placeholder="Rangement..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Inconnu</SelectItem>
                  {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Marque (optionnel)</Label>
              <Input value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL SUPPRESSION */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-destructive">Confirmer la suppression</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Voulez-vous vraiment retirer <b>{productToDelete?.name}</b> de l'inventaire ?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Conserver</Button>
            <Button variant="destructive" onClick={handleDelete}>Supprimer définitivement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}