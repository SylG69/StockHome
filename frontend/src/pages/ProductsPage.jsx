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

  // État du formulaire
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

  // --- LOGIQUE DE RÉCUPÉRATION DES DONNÉES ---
  const fetchData = async () => {
    try {
      const [productsRes, categoriesRes, locationsRes] = await Promise.all([
        api.get('/products'),
        api.get('/categories'),
        api.get('/locations')
      ]);
      setProducts(productsRes.data);
      setCategories(categoriesRes.data);
      setLocations(locationsRes.data);
    } catch (error) {
      console.error(error);
      toast.error("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- CALCUL DES VARIABLES GLOBALES ---
  const subCategories = categories.flatMap(c => c.sub_categories || c.subcategories || []);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.brand && p.brand.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const groupedProducts = filteredProducts.reduce((acc, product) => {
    const subId = product.sub_category_id || 'none';
    if (!acc[subId]) acc[subId] = { items: [], total: 0 };
    acc[subId].items.push(product);
    acc[subId].total += (product.quantity || 0);
    return acc;
  }, {});

  // --- ACTIONS ---
  const handleUpdateThreshold = async (subId, value) => {
    const min_stock = parseInt(value, 10);
    if (isNaN(min_stock)) return;
    try {
      const encodedId = encodeURIComponent(subId);
      await api.patch(`/subcategories/${encodedId}/threshold`, { min_stock });
      toast.success("Seuil mis à jour");
      fetchData();
    } catch (error) {
      toast.error("Erreur de sauvegarde du seuil");
    }
  };

  const handleSave = async () => {
    if (!formData.name) return toast.error("Le nom est requis");
    setSaving(true);
    try {
      if (editingProduct) {
        await api.put(`/products/${encodeURIComponent(editingProduct.id)}`, formData);
        toast.success("Produit mis à jour");
      } else {
        await api.post('/products', formData);
        toast.success("Produit ajouté");
      }
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error("Erreur d'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!productToDelete) return;
    try {
      await api.delete(`/products/${encodeURIComponent(productToDelete.id)}`);
      setDeleteDialogOpen(false);
      fetchData();
      toast.success("Produit supprimé");
    } catch (error) {
      toast.error("Erreur de suppression");
    }
  };

  const updateQty = async (id, delta) => {
    try {
      await api.patch(`/products/${encodeURIComponent(id)}/quantity`, { delta });
      fetchData();
    } catch (error) {
      toast.error("Erreur mise à jour quantité");
    }
  };

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="p-4 pb-24 max-w-5xl mx-auto space-y-6">
      {/* Header & Search */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Package className="w-8 h-8 text-primary" /> Inventaire
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button onClick={() => { setEditingProduct(null); setFormData(initialForm); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Produit
          </Button>
        </div>
      </div>

      {/* Accordion List */}
      <Accordion type="multiple" defaultValue={Object.keys(groupedProducts)} className="space-y-4">
        {Object.entries(groupedProducts).map(([subId, data]) => {
          const sub = subCategories.find(s => s.id === subId) || { name: "Non classé", min_stock: 0 };
          const isAlert = data.total <= (sub.min_stock || 0);

          return (
            <AccordionItem key={subId} value={subId} className="border rounded-xl bg-card shadow-sm overflow-hidden">
              <div className="flex items-center bg-muted/30 pr-4">
                <AccordionTrigger className="flex-1 px-4 hover:no-underline">
                  <div className="flex items-center gap-4 text-left">
                    <span className="text-lg font-semibold">{sub.name}</span>
                    <Badge variant={isAlert ? "destructive" : "outline"} className="px-3">
                      {data.total} en stock
                    </Badge>
                  </div>
                </AccordionTrigger>

                {/* Réglage du seuil directement dans la ligne */}
                <div className="flex items-center gap-2 bg-background/50 border rounded-lg px-2 py-1">
                  <AlertTriangle className={`w-3 h-3 ${isAlert ? "text-destructive" : "text-muted-foreground"}`} />
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Alerte :</span>
                  <Input
                    type="number"
                    defaultValue={sub.min_stock || 0}
                    className="w-12 h-6 text-xs border-none bg-transparent p-0 text-center font-bold"
                    onBlur={(e) => handleUpdateThreshold(subId, e.target.value)}
                  />
                </div>
              </div>

              <AccordionContent className="px-4 pt-4 pb-2">
                <div className="grid gap-3">
                  {data.items.map((product) => (
                    <div key={product.id} className="flex items-center justify-between p-3 rounded-lg border bg-background/50 group">
                      <div className="flex items-center gap-3">
                        {product.image_url && (
                          <img src={product.image_url} alt="" className="w-10 h-10 rounded object-cover border" />
                        )}
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{product.brand || 'Sans marque'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(product.id, -1)}>
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="w-8 text-center font-bold">{product.quantity}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(product.id, 1)}>
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditingProduct(product); setFormData(product); setDialogOpen(true); }}>
                              <Edit className="w-4 h-4 mr-2" /> Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => { setProductToDelete(product); setDeleteDialogOpen(true); }}>
                              <Trash2 className="w-4 h-4 mr-2" /> Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Dialog Ajout/Modif */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Modifier le produit" : "Ajouter un produit"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nom du produit</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Quantité actuelle</Label>
                <Input type="number" value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 0})} />
              </div>
              <div className="grid gap-2">
                <Label>Unité (ex: kg, pack)</Label>
                <Input value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Sous-catégorie</Label>
              <Select value={formData.sub_category_id || "none"} onValueChange={v => setFormData({...formData, sub_category_id: v === "none" ? null : v})}>
                <SelectTrigger><SelectValue placeholder="Choisir une catégorie" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sans catégorie</SelectItem>
                  {subCategories.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Emplacement</Label>
              <Select value={formData.location_id || "none"} onValueChange={v => setFormData({...formData, location_id: v === "none" ? null : v})}>
                <SelectTrigger><SelectValue placeholder="Choisir un lieu" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Inconnu</SelectItem>
                  {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Suppression */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Supprimer ?</DialogTitle></DialogHeader>
          <p>Êtes-vous sûr de vouloir supprimer <b>{productToDelete?.name}</b> ?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}