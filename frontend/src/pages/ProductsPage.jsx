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
  const [subCategories, setSubCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- ÉTATS PAR DÉFAUT SELON TES CAPTURES ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterLocation, setFilterLocation] = useState('all');
  const [filterLowStock, setFilterLowStock] = useState(searchParams.get('low_stock') === 'true');
  const [hideOutOfStock, setHideOutOfStock] = useState(true); // "En stock uniquement" coché par défaut
  const [isGrouped, setIsGrouped] = useState(true);           // "Grouper l'affichage" coché par défaut

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '', description: '', barcode: '', quantity: 0, min_quantity: 1,
    unit: 'unité', category_id: '', sub_category_id: '', location_id: '',
    image_url: '', brand: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [productsRes, categoriesRes, locationsRes, subCatsRes] = await Promise.all([
        api.get('/products'),
        api.get('/categories'),
        api.get('/locations'),
        api.get('/subcategories'),
      ]);
      setProducts(productsRes.data);
      setCategories(categoriesRes.data);
      setLocations(locationsRes.data);
      setSubCategories(subCatsRes.data);
    } catch (error) {
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const updateThreshold = async (subCatId, newThreshold) => {
    try {
      const subCat = subCategories.find(s => s.id === subCatId);
      if (!subCat) return;

      const payload = {
        name: subCat.name,
        category_id: subCat.category_id,
        min_quantity: parseInt(newThreshold) || 0
      };

      // Utilisation de encodeURIComponent ici aussi
      const encodedId = encodeURIComponent(subCatId);
      await api.put(`/subcategories/${encodedId}`, payload);

      setSubCategories(prev => prev.map(s =>
        s.id === subCatId ? { ...s, min_quantity: payload.min_quantity } : s
      ));
      toast.success("Seuil mis à jour");
    } catch (error) {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const handleQuantityChange = async (product, delta) => {
    try {
      const response = await api.patch(`/products/${product.id}/quantity?delta=${delta}`);
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, quantity: response.data.quantity } : p));
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  // --- LOGIQUE DE FILTRAGE ET REGROUPEMENT ---
  const filteredProducts = products.filter((product) => {
    const subCat = subCategories.find(s => s.id === product.sub_category_id);
    const threshold = subCat ? (subCat.min_quantity || 0) : 0;

    const matchesSearch = searchQuery === '' ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.brand?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = filterCategory === 'all' || product.category_id === filterCategory;
    const matchesLocation = filterLocation === 'all' || product.location_id === filterLocation;
    const matchesLowStock = !filterLowStock || product.quantity < threshold;
    const matchesAvailable = !hideOutOfStock || product.quantity > 0;

    return matchesSearch && matchesCategory && matchesLocation && matchesLowStock && matchesAvailable;
  });

  const groupedProducts = filteredProducts.reduce((acc, product) => {
    const subCatId = product.sub_category_id || 'no-sub';
    const subCat = subCategories.find(s => s.id === subCatId);
    if (!acc[subCatId]) {
      acc[subCatId] = {
        name: subCat?.name || "Sans sous-catégorie",
        products: [],
        totalStock: 0,
        threshold: subCat?.min_quantity || 0
      };
    }
    acc[subCatId].products.push(product);
    acc[subCatId].totalStock += product.quantity;
    return acc;
  }, {});

  // --- COMPOSANT CARTE PRODUIT ---
  const ProductCard = ({ product, groupTotalStock, groupThreshold }) => {
    const isLowStock = groupTotalStock < groupThreshold;

    return (
      <Card className="bg-card border-border card-hover animate-fade-in">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            {product.image_url ? (
              <img src={product.image_url} alt={product.name} className="w-16 h-16 rounded-lg object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-secondary flex items-center justify-center">
                <Package className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleOpenDialog(product)}><Edit className="w-4 h-4 mr-2" /> Modifier</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => { setProductToDelete(product); setDeleteDialogOpen(true); }}>
                  <Trash2 className="w-4 h-4 mr-2" /> Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Badge variant="default" className="text-xs mb-1">
            {subCategories.find(s => s.id === product.sub_category_id)?.name || "Général"}
          </Badge>
          <h3 className="font-semibold text-sm truncate">{product.name}</h3>
          <p className="text-xs text-muted-foreground truncate mb-4">{product.brand || 'Sans marque'}</p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleQuantityChange(product, -1)} disabled={product.quantity <= 0}>
                <Minus className="w-3 h-3" />
              </Button>
              <span className={`text-lg font-bold min-w-[30px] text-center ${isLowStock ? 'text-destructive' : 'text-emerald-500'}`}>
                {product.quantity}
              </span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleQuantityChange(product, 1)}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
            {isLowStock && (
              <div className="flex items-center gap-1 text-[10px] text-destructive font-black uppercase tracking-tighter">
                <AlertTriangle className="w-3 h-3" /> Stock bas
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // --- VUES CONDITIONNELLES ---
  const productsView = isGrouped ? (
    <Accordion type="multiple" defaultValue={Object.keys(groupedProducts)} className="space-y-4">
      {Object.entries(groupedProducts).map(([subCatId, group]) => {
        const isGroupLowStock = group.totalStock < group.threshold;
        return (
          <AccordionItem key={subCatId} value={subCatId} className="border-none">
            <AccordionTrigger className="hover:no-underline py-2 px-4 bg-secondary/50 rounded-lg group">
              <div className="flex items-center justify-between w-full pr-4">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-lg">{group.name}</span>
                  <Badge variant="outline" className="bg-background">{group.products.length} produits</Badge>
                </div>
                <div className="flex items-center gap-4 sm:gap-8">
                  <div className="flex items-center gap-2 bg-background/80 px-2 py-1 rounded-md border border-border shadow-sm" onClick={(e) => e.stopPropagation()}>
                    <Label className="text-[10px] uppercase font-black text-muted-foreground">Min :</Label>
                    <Input
                      type="number"
                      className="h-6 w-12 text-center text-xs bg-transparent border-none focus-visible:ring-0 p-0 font-bold"
                      defaultValue={group.threshold}
                      onBlur={(e) => updateThreshold(subCatId, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (updateThreshold(subCatId, e.target.value), e.target.blur())}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden sm:inline text-[10px] text-muted-foreground uppercase font-bold">Total :</span>
                    <Badge className={`h-7 px-3 flex items-center font-bold ${isGroupLowStock ? "bg-destructive" : "bg-emerald-500"}`}>
                      {group.totalStock}
                    </Badge>
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 px-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {group.products.map(p => (
                  <ProductCard key={p.id} product={p} groupTotalStock={group.totalStock} groupThreshold={group.threshold} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  ) : (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {filteredProducts.map(p => {
        const sub = subCategories.find(s => s.id === p.sub_category_id);
        return <ProductCard key={p.id} product={p} groupTotalStock={p.quantity} groupThreshold={sub?.min_quantity || 0} />;
      })}
    </div>
  );

  const handleOpenDialog = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({ ...product, description: product.description || '', barcode: product.barcode || '', brand: product.brand || '' });
    } else {
      setEditingProduct(null);
      setFormData({ name: '', description: '', barcode: '', quantity: 0, min_quantity: 1, unit: 'unité', category_id: '', sub_category_id: '', location_id: '', image_url: '', brand: '' });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Le nom est requis");
      return;
    }

    setSaving(true);
    try {
      if (editingProduct) {
        const encodedId = encodeURIComponent(editingProduct.id);
        await api.put(`/products/${encodedId}`, formData);
        toast.success("Produit mis à jour");
      } else {
        await api.post('/products', formData);
        toast.success("Produit ajouté");
      }
      setDialogOpen(false);
      fetchData(); // Utilise fetchData au lieu de fetchProducts pour tout recharger
    } catch (error) {
      console.error(error);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!productToDelete) return;
    try {
      const encodedId = encodeURIComponent(productToDelete.id);
      await api.delete(`/products/${encodedId}`);
      toast.success('Produit supprimé');
      setDeleteDialogOpen(false);
      fetchProducts();
    } catch (e) {
      toast.error("Erreur lors de la suppression");
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin h-12 w-12" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Produits</h1>
          <p className="text-muted-foreground mt-1">Gérez votre inventaire de produits</p>
        </div>
        <div className="flex gap-3">
          <Link to="/scanner"><Button className="btn-glow"><ScanLine className="w-4 h-4 mr-2" /> Scanner</Button></Link>
          <Button onClick={() => handleOpenDialog()} className="btn-glow"><Plus className="w-4 h-4 mr-2" /> Ajouter</Button>
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-4 flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Rechercher..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Catégorie" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2"><Settings2 className="w-4 h-4" /> Options</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-2">
                <div className="space-y-4 p-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">En stock uniquement</Label>
                    <Switch checked={hideOutOfStock} onCheckedChange={setHideOutOfStock} />
                  </div>
                  <div className="flex items-center justify-between border-t pt-3">
                    <Label className="text-sm">Stock bas</Label>
                    <Switch checked={filterLowStock} onCheckedChange={setFilterLowStock} />
                  </div>
                  <div className="flex items-center justify-between border-t pt-3 font-bold">
                    <Label className="text-sm">Grouper l'affichage</Label>
                    <Switch checked={isGrouped} onCheckedChange={setIsGrouped} />
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      {filteredProducts.length > 0 ? productsView : (
        <Card className="bg-card border-border py-16 text-center">
          <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Aucun produit trouvé</h3>
        </Card>
      )}

      {/* Dialog Add/Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingProduct ? 'Modifier' : 'Ajouter'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="col-span-2"><Label>Nom *</Label><Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
            <div>
              <Label>Quantité</Label>
              <Input
                type="number"
                step="1"
                value={formData.quantity}
                onChange={e => setFormData({
                  ...formData,
                  quantity: parseInt(e.target.value, 10) || 0
                })}
              />
            </div>
            <div><Label>Sous-catégorie</Label>
              <Select value={formData.sub_category_id || "none"} onValueChange={v => setFormData({...formData, sub_category_id: v === "none" ? null : v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Aucune</SelectItem>{subCategories.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {/* Autres champs simplifiés ici... */}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}