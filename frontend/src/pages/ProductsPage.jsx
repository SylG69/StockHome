import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
  Check,
  ChevronsUpDown,
} from 'lucide-react';
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export default function ProductsPage() {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- ÉTATS PAR DÉFAUT ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterLocation, setFilterLocation] = useState('all');
  const [filterLowStock, setFilterLowStock] = useState(searchParams.get('low_stock') === 'true');
  const [hideOutOfStock, setHideOutOfStock] = useState(true);
  const [isGrouped, setIsGrouped] = useState(true);

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [subCategoryComboOpen, setSubCategoryComboOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '', description: '', barcode: '', quantity: 0, min_quantity: 1,
    unit: 'unité', category_id: '', sub_category_id: '', sub_category_name: '', location_id: '',
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

  const handleUpdateThreshold = async (subId, value) => {
    const min_stock = Math.max(0, parseInt(value, 10));
    if (isNaN(min_stock)) return;

    try {
      const encodedId = encodeURIComponent(subId);
      await api.patch(`/subcategories/${encodedId}/threshold`, {
        min_quantity: min_stock
      });

      toast.success("Seuil mis à jour");
      fetchData();
    } catch (error) {
      console.error("Erreur lors de la mise à jour du seuil:", error);
      toast.error("Erreur de sauvegarde du seuil");
    }
  };

  // --- RENOMMAGE D'UNE SOUS-CATÉGORIE ---
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingSubCategory, setRenamingSubCategory] = useState(null); // { id, name, categoryId, threshold }
  const [renameValue, setRenameValue] = useState('');

  const handleOpenRenameDialog = (subCatId, group) => {
    setRenamingSubCategory({ id: subCatId, categoryId: group.categoryId, threshold: group.threshold });
    setRenameValue(group.name);
    setRenameDialogOpen(true);
  };

  const handleRenameSubCategory = async () => {
    if (!renamingSubCategory) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      toast.error('Le nom ne peut pas être vide');
      return;
    }
    try {
      const encodedId = encodeURIComponent(renamingSubCategory.id);
      // PUT (et non PATCH) : l'endpoint remplace tous les champs, on renvoie
      // donc category_id/min_quantity inchangés en plus du nouveau nom.
      await api.put(`/subcategories/${encodedId}`, {
        name: trimmed,
        category_id: renamingSubCategory.categoryId,
        min_quantity: renamingSubCategory.threshold,
      });
      toast.success('Sous-catégorie renommée');
      setRenameDialogOpen(false);
      setRenamingSubCategory(null);
      fetchData();
    } catch (error) {
      console.error('Erreur lors du renommage:', error);
      toast.error('Erreur lors du renommage');
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
        threshold: subCat?.min_quantity || 0,
        // Nécessaire pour le renommage : PUT /subcategories/{id} remplace
        // TOUS les champs (pas de mise à jour partielle côté backend), il
        // faut donc renvoyer category_id/min_quantity inchangés avec le
        // nouveau nom, sous peine de les réinitialiser à leurs défauts.
        categoryId: subCat?.category_id || null,
      };
    }
    acc[subCatId].products.push(product);
    acc[subCatId].totalStock += product.quantity;
    return acc;
  }, {});

  // --- BADGE NUTRI-SCORE ---
  const NUTRISCORE_STYLES = {
    a: 'bg-emerald-500 text-white',
    b: 'bg-lime-500 text-white',
    c: 'bg-amber-400 text-black',
    d: 'bg-orange-500 text-white',
    e: 'bg-destructive text-white',
  };

  const NutriscoreBadge = ({ grade }) => {
    if (!grade || !NUTRISCORE_STYLES[grade]) {
      return <span className="text-xs text-muted-foreground">—</span>;
    }
    return (
      <span
        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black uppercase ${NUTRISCORE_STYLES[grade]}`}
        title={`Nutri-Score ${grade.toUpperCase()}`}
      >
        {grade}
      </span>
    );
  };

  // --- LIGNE DE TABLEAU PRODUIT ---
  // Vue synthétique demandée : miniature, nom, marque, catégorie,
  // emplacement, nutriscore. La quantité et les actions sont conservées
  // car nécessaires à la gestion du stock (fonctionnalité déjà existante).
  const ProductRow = ({ product, groupTotalStock, groupThreshold }) => {
    const isLowStock = groupTotalStock < groupThreshold;
    const category = categories.find(c => c.id === product.category_id);
    const location = locations.find(l => l.id === product.location_id);

    return (
      <tr
        className="border-b border-border last:border-0 hover:bg-secondary/30 cursor-pointer transition-colors"
        onClick={() => navigate(`/products/${product.id}`)}
        data-testid={`product-row-${product.id}`}
      >
        <td className="p-3 w-16">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-10 h-10 rounded-lg object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
              <Package className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
        </td>
        <td className="p-3 font-medium text-sm">{product.name}</td>
        <td className="p-3 text-sm text-muted-foreground">{product.brand || 'Sans marque'}</td>
        <td className="p-3 text-sm text-muted-foreground">{category?.name || '—'}</td>
        <td className="p-3 text-sm text-muted-foreground">{location?.name || '—'}</td>
        <td className="p-3"><NutriscoreBadge grade={product.nutriscore_grade} /></td>
        <td className="p-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1 bg-secondary/40 p-1 rounded-lg border border-border w-fit">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md hover:bg-background"
              onClick={() => handleQuantityChange(product, -1)}
              disabled={product.quantity <= 0}
            >
              <Minus className="w-3.5 h-3.5" />
            </Button>
            <span className={`text-sm font-bold min-w-[28px] text-center ${isLowStock ? 'text-destructive' : 'text-emerald-500'}`}>
              {product.quantity}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md hover:bg-background"
              onClick={() => handleQuantityChange(product, 1)}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          {isLowStock && (
            <div className="flex items-center gap-1 text-[10px] text-destructive font-black uppercase tracking-tighter mt-1">
              <AlertTriangle className="w-3 h-3" /> Stock bas
            </div>
          )}
        </td>
        <td className="p-3 w-10" onClick={(e) => e.stopPropagation()}>
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
        </td>
      </tr>
    );
  };

  // --- TABLEAU DE PRODUITS (en-têtes + lignes) ---
  const ProductsTable = ({ products, groupTotalStock, groupThreshold }) => (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full">
        <thead>
          <tr className="bg-secondary/50 text-left text-xs uppercase text-muted-foreground font-bold">
            <th className="p-3 w-16"></th>
            <th className="p-3">Nom</th>
            <th className="p-3">Marque</th>
            <th className="p-3">Catégorie</th>
            <th className="p-3">Emplacement</th>
            <th className="p-3">Nutri-Score</th>
            <th className="p-3">Quantité</th>
            <th className="p-3 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => (
            <ProductRow
              key={p.id}
              product={p}
              groupTotalStock={groupTotalStock ?? p.quantity}
              groupThreshold={groupThreshold ?? (subCategories.find(s => s.id === p.sub_category_id)?.min_quantity || 0)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );

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
                  {subCatId !== 'no-sub' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); handleOpenRenameDialog(subCatId, group); }}
                      title="Renommer la sous-catégorie"
                      data-testid={`rename-subcategory-${subCatId}`}
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Badge variant="outline" className="bg-background">{group.products.length} produits</Badge>
                </div>
                <div className="flex items-center gap-4 sm:gap-6">
                  {subCatId !== 'no-sub' && (
                    /* Suppression de bg-background/80, border, border-border et shadow-sm ici */
                    <div
                      className="flex items-center gap-1.5 px-1 py-1 touch-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Label className="text-[10px] uppercase font-black text-muted-foreground mr-1">Min :</Label>

                      {/* Masquage du bouton "-" si le seuil est à 0 */}
                      {group.threshold > 0 ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 rounded-sm p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => handleUpdateThreshold(subCatId, group.threshold - 1)}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                      ) : (
                        <div className="w-5 h-5" />
                      )}

                      <Badge variant="secondary" className="h-5 min-w-[24px] justify-center px-1 font-bold text-xs bg-muted">
                        {group.threshold}
                      </Badge>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 rounded-sm p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => handleUpdateThreshold(subCatId, group.threshold + 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
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
              <ProductsTable products={group.products} groupTotalStock={group.totalStock} groupThreshold={group.threshold} />
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  ) : (
  // ... reste du code inchangé
    <ProductsTable products={filteredProducts} />
  );

  const handleOpenDialog = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        ...product,
        description: product.description || '',
        barcode: product.barcode || '',
        brand: product.brand || '',
        sub_category_name: product.sub_category_name || '',
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '', description: '', barcode: '', quantity: 0, min_quantity: 1,
        unit: 'unité', category_id: '', sub_category_id: '', sub_category_name: '', location_id: '',
        image_url: '', brand: '',
      });
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
      fetchData();
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
      setProductToDelete(null);
      fetchData();
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
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader><DialogTitle>{editingProduct ? 'Modifier' : 'Ajouter'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Nom *</Label>
              <Input
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="bg-input border-border"
              />
            </div>

            <div className="col-span-2">
              <Label>Marque</Label>
              <Input
                value={formData.brand}
                onChange={e => setFormData({...formData, brand: e.target.value})}
                className="bg-input border-border"
              />
            </div>

            <div>
              <Label>Quantité</Label>
              <Input
                type="number"
                min="0"
                value={formData.quantity}
                onChange={e => setFormData({
                  ...formData,
                  quantity: parseInt(e.target.value, 10) || 0
                })}
                className="bg-input border-border"
              />
            </div>

            <div>
              <Label>Catégorie</Label>
              <Select
                value={formData.category_id || "none"}
                onValueChange={v => setFormData({...formData, category_id: v === "none" ? null : v})}
              >
                <SelectTrigger className="bg-input border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Sous-catégorie</Label>
              <Popover open={subCategoryComboOpen} onOpenChange={setSubCategoryComboOpen}>
                <PopoverTrigger asChild>
                  <button
                    role="combobox"
                    aria-expanded={subCategoryComboOpen}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-input px-3 py-2 text-sm shadow-sm"
                  >
                    {formData.sub_category_name || "Chercher ou choisir..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command>
                    <CommandInput
                      placeholder="Rechercher une sous-catégorie..."
                      onValueChange={(searchTerm) => {
                        const formattedTerm = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1);
                        setFormData({ ...formData, sub_category_name: formattedTerm, sub_category_id: null });
                      }}
                    />
                    <CommandList>
                      <CommandEmpty className="p-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-primary"
                          onClick={() => setSubCategoryComboOpen(false)}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Créer "{formData.sub_category_name}"
                        </Button>
                      </CommandEmpty>
                      <CommandGroup title="Suggestions">
                        {subCategories.map((sub) => (
                          <CommandItem
                            key={sub.id}
                            value={sub.name}
                            onSelect={() => {
                              setFormData({
                                ...formData,
                                sub_category_id: sub.id,
                                sub_category_name: sub.name,
                              });
                              setSubCategoryComboOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.sub_category_id === sub.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {sub.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-[10px] text-muted-foreground mt-1">
                Tapez pour chercher/créer ou choisissez une suggestion.
              </p>
            </div>

            <div>
              <Label>Emplacement</Label>
              <Select
                value={formData.location_id || "none"}
                onValueChange={v => setFormData({...formData, location_id: v === "none" ? null : v})}
              >
                <SelectTrigger className="bg-input border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun</SelectItem>
                  {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation de suppression -- manquait dans la refonte en
          tableaux, d'où l'impossibilité de supprimer un produit jusqu'ici. */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce produit ?</AlertDialogTitle>
            <AlertDialogDescription>
              {productToDelete && (
                <>Le produit <strong>{productToDelete.name}</strong> sera définitivement supprimé de votre stock. Cette action est irréversible.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setProductToDelete(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-delete-product-btn"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Renommage d'une sous-catégorie */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Renommer la sous-catégorie</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-subcategory-input">Nom</Label>
            <Input
              id="rename-subcategory-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubCategory(); }}
              autoFocus
              data-testid="rename-subcategory-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleRenameSubCategory} data-testid="confirm-rename-subcategory-btn">Renommer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}