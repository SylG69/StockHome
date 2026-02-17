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
  Filter,
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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterLocation, setFilterLocation] = useState('all');
  const [filterLowStock, setFilterLowStock] = useState(searchParams.get('low_stock') === 'true');
  const [hideOutOfStock, setHideOutOfStock] = useState(false);
  const [subCategories, setSubCategories] = useState([]);

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isGrouped, setIsGrouped] = useState(false);
  const [subCatDialogOpen, setSubCatDialogOpen] = useState(false);
  const [editingSubCat, setEditingSubCat] = useState(null);
  const [subCatThreshold, setSubCatThreshold] = useState(0);
  const [updatingSubCat, setUpdatingSubCat] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    barcode: '',
    quantity: 0,
    min_quantity: 1,
    unit: 'unité',
    category_id: '',
    sub_category_id: '',
    location_id: '',
    image_url: '',
    brand: '',
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
        console.error('Erreur lors du chargement des données:', error);
        toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSubCatThreshold = async () => {
    setUpdatingSubCat(true);
    try {
      // On reprend les données existantes et on change juste le min_quantity
      const payload = {
        name: editingSubCat.name,
        category_id: editingSubCat.category_id,
        min_quantity: subCatThreshold
      };

      await api.put(`/subcategories/${editingSubCat.id}`, payload);
      toast.success(`Seuil mis à jour pour ${editingSubCat.name}`);
      setSubCatDialogOpen(false);
      fetchData(); // Rafraîchir les données pour recalculer les alertes stock
    } catch (error) {
      toast.error("Erreur lors de la mise à jour du seuil");
    } finally {
      setUpdatingSubCat(false);
    }
  };

  const filteredProducts = products.filter((product) => {
    // 1. On trouve la sous-catégorie du produit
    const subCat = subCategories.find(s => s.id === product.sub_category_id);

    // 2. Le seuil est celui de la sous-catégorie (ou 0 si aucune)
    const threshold = subCat ? subCat.min_quantity : 0;
    const matchesSearch =
      searchQuery === '' ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.brand?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      filterCategory === 'all' || product.category_id === filterCategory;

    const matchesLocation =
      filterLocation === 'all' || product.location_id === filterLocation;

    const minQty = subCat ? subCat.min_quantity : 0;

    const matchesLowStock = !filterLowStock || product.quantity < threshold;

    const matchesAvailable = !hideOutOfStock || product.quantity > 0;

    return matchesSearch && matchesCategory && matchesLocation && matchesLowStock && matchesAvailable;
  });

  const groupedProducts = filteredProducts.reduce((acc, product) => {
  const subCatId = product.sub_category_id || 'no-sub';
  const subCatName = subCategories.find(s => s.id === product.sub_category_id)?.name || "Sans sous-catégorie";

  if (!acc[subCatId]) {
    acc[subCatId] = {
      name: subCatName,
      products: [],
      totalStock: 0
    };
  }

  acc[subCatId].products.push(product);
  acc[subCatId].totalStock += product.quantity;
  return acc;
}, {});

  const handleOpenDialog = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        description: product.description || '',
        barcode: product.barcode || '',
        quantity: product.quantity,
        min_quantity: product.min_quantity,
        unit: product.unit || 'unité',
        category_id: product.category_id || '',
        sub_category_id: product.sub_category_id || '',
        location_id: product.location_id || '',
        image_url: product.image_url || '',
        brand: product.brand || '',
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        description: '',
        barcode: '',
        quantity: 0,
        min_quantity: 1,
        unit: 'unité',
        category_id: '',
        sub_category_id: '',
        location_id: '',
        image_url: '',
        brand: '',
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Le nom du produit est requis');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        category_id: formData.category_id || null,
        sub_category_id: formData.sub_category_id || null,
        location_id: formData.location_id || null,
      };

      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
        toast.success('Produit mis à jour');
      } else {
        await api.post('/products', payload);
        toast.success('Produit créé');
      }
      setDialogOpen(false);
      fetchData();
    } catch (error) {
        console.error('Erreur lors de l\'enregistrement:', error);
        toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!productToDelete) return;

    try {
      await api.delete(`/products/${productToDelete.id}`);
      toast.success('Produit supprimé');
      setDeleteDialogOpen(false);
      setProductToDelete(null);
      fetchData();
    } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        toast.error('Erreur lors de la suppression');
    }
  };
  // Composant interne pour éviter la répétition du code du Card
  const ProductCard = ({ product }) => {
    // Récupérer le seuil de la sous-catégorie
    const subCat = subCategories.find(s => s.id === product.sub_category_id);
    const threshold = subCat ? subCat.min_quantity : 0;
    const isLowStock = product.quantity < threshold;
    const minQty = subCat ? subCat.min_quantity : 0;
    return (
      <Card className="bg-card border-border card-hover animate-fade-in">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-16 h-16 rounded-lg object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-secondary flex items-center justify-center">
                <Package className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid={`product-menu-${product.id}`}>
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleOpenDialog(product)}>
                  <Edit className="w-4 h-4 mr-2" />
                  Modifier
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setProductToDelete(product);
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
          <Badge variant="default" className="text-xs">
            {subCategories.find(s => s.id === product.sub_category_id)?.name || "Sans sous-catégorie"}
          </Badge>
          <h3 className="font-semibold text-sm truncate">{product.name}</h3>
          <p className="text-xs text-muted-foreground truncate mb-2">
            {product.brand || 'Sans marque'}
          </p>
          {product.barcode && (
            <p className="text-xs text-muted-foreground font-mono mb-2">
              <ScanLine className="w-3 h-3 inline mr-1" />
              {product.barcode}
            </p>
          )}
          <div className="flex flex-wrap gap-1 mb-3">
            {product.category_name && (
              <Badge variant="secondary" className="text-xs">
                {product.category_name}
              </Badge>
            )}
            {product.location_name && (
              <Badge variant="outline" className="text-xs">
                {product.location_name}
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleQuantityChange(product, -1)}
                disabled={product.quantity <= 0}
              >
                <Minus className="w-3 h-3" />
              </Button>

              <span className={`text-lg font-bold min-w-[40px] text-center ${
                  isLowStock ? 'text-destructive' : 'text-emerald-500'
                }`}
              >
                {product.quantity}
              </span>

              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleQuantityChange(product, 1)}
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
            {/* On affiche le seuil commun s'il existe */}
            {subCat && (
              <span className="text-[10px] text-muted-foreground italic">
                Seuil ({subCat.name}) : {minQty}
              </span>
            )}
          </div>

          {isLowStock && (
            <div className="mt-2 flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="w-3 h-3" />
              Stock bas (Seuil : {threshold})
            </div>
          )}
        </CardContent>
      </Card>
    );
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

      await api.put(`/subcategories/${subCatId}`, payload);
      // On met à jour l'état local immédiatement pour que les alertes se calculent
      setSubCategories(prev => prev.map(s => s.id === subCatId ? { ...s, min_quantity: payload.min_quantity } : s));
      toast.success("Seuil mis à jour");
    } catch (error) {
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const handleQuantityChange = async (product, delta) => {
    try {
      const response = await api.patch(`/products/${product.id}/quantity?delta=${delta}`);
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, quantity: response.data.quantity } : p
        )
      );
    } catch (error) {
        console.error('Erreur lors de la mise à jour:', error);
        toast.error('Erreur lors de la mise à jour');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const productsView = isGrouped ? (
    // --- VUE REGROUPÉE (ACCORDION) ---
    <Accordion type="multiple" defaultValue={Object.keys(groupedProducts)} className="space-y-4">
      {Object.entries(groupedProducts).map(([subCatId, group]) => {
        // On récupère la sous-catégorie actuelle pour avoir son min_quantity
        const currentSubCat = subCategories.find(s => s.id === subCatId);
        const currentMinQty = currentSubCat?.min_quantity || 0;
        return (
          <AccordionItem key={subCatId} value={subCatId} className="border-none">
            <AccordionTrigger className="hover:no-underline py-2 px-4 bg-secondary/50 rounded-lg group">
              <div className="flex items-center justify-between w-full pr-4">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-lg">{group.name}</span>
                  <Badge variant="outline" className="bg-background">
                    {group.products.length} {group.products.length > 1 ? 'produits' : 'produit'}
                  </Badge>
                </div>
              {/* SECTION RÉGLAGE SEUIL */}
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2 bg-background/50 px-2 py-1 rounded-md border border-border"
                       onClick={(e) => e.stopPropagation()}> {/* Empêche l'ouverture de l'accordéon au clic sur l'input */}
                    <Label htmlFor={`threshold-${subCatId}`} className="text-[10px] uppercase font-bold text-muted-foreground">
                      Seuil Alerte :
                    </Label>
                    <Input
                      id={`threshold-${subCatId}`}
                      type="number"
                      className="h-7 w-16 text-center text-xs bg-transparent border-none focus-visible:ring-1 focus-visible:ring-primary p-0"
                      defaultValue={subCategories.find(s => s.id === subCatId)?.min_quantity || 0}
                      onBlur={(e) => updateThreshold(subCatId, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updateThreshold(subCatId, e.target.value);
                          e.target.blur(); // Retire le focus
                        }
                      }}
                    />
                  </div>
                  {/* SECTION STOCK TOTAL */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">
                      Stock Total:
                    </span>
                    <Badge className={group.totalStock > 0 ? "bg-emerald-500" : "bg-destructive"}>
                      {group.totalStock}
                    </Badge>
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 px-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {group.products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
    })}
    </Accordion>
  ) : (
    // --- VUE GRILLE SIMPLE ---
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {filteredProducts.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );

  return (
    <div className="space-y-6" data-testid="products-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Produits</h1>
          <p className="text-muted-foreground mt-1">
            Gérez votre inventaire de produits
          </p>
        </div>
        <div className="flex gap-3">
          <Link to="/scanner">
            <Button className="btn-glow" data-testid="quick-scan-btn">
              <ScanLine className="w-4 h-4 mr-2" />
              Scanner
            </Button>
          </Link>
        <Button onClick={() => handleOpenDialog()} className="btn-glow" data-testid="add-product-btn">
          <Plus className="w-4 h-4 mr-2" />
          Ajouter un produit
        </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom, code-barres ou marque..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-input border-border"
                  data-testid="search-products-input"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              {/* Sélecteurs Classiques */}
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[160px] bg-input border-border" data-testid="filter-category">
                  <SelectValue placeholder="Catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes catégories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterLocation} onValueChange={setFilterLocation}>
                <SelectTrigger className="w-[160px] bg-input border-border" data-testid="filter-location">
                  <SelectValue placeholder="Emplacement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous emplacements</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Menu déroulant des options d'affichage */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Settings2 className="w-4 h-4" />
                    Options
                    {(hideOutOfStock || filterLowStock || isGrouped) && (
                      <Badge variant="default" className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px]">
                        {[hideOutOfStock, filterLowStock, isGrouped].filter(Boolean).length}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-2">
                  <div className="space-y-4 p-2">
                    {/* Switch En Stock */}
                    <div className="flex items-center justify-between space-x-2">
                      <Label htmlFor="available-mode" className="flex flex-col gap-1 cursor-pointer">
                        <span className="text-sm font-medium">En stock uniquement</span>
                        <span className="text-[10px] text-muted-foreground font-normal">Masquer les épuisés</span>
                      </Label>
                      <Switch
                        id="available-mode"
                        checked={hideOutOfStock}
                        onCheckedChange={setHideOutOfStock}
                      />
                    </div>

                    {/* Switch Stock Bas */}
                    <div className="flex items-center justify-between space-x-2 border-t pt-3 border-border">
                      <Label htmlFor="low-stock-mode" className="flex flex-col gap-1 cursor-pointer">
                        <div className="flex items-center gap-1 text-sm font-medium">
                          <AlertTriangle className={`w-3 h-3 ${filterLowStock ? 'text-destructive' : ''}`} />
                          Stock bas
                        </div>
                        <span className="text-[10px] text-muted-foreground font-normal">Sous le seuil minimum</span>
                      </Label>
                      <Switch
                        id="low-stock-mode"
                        checked={filterLowStock}
                        onCheckedChange={setFilterLowStock}
                      />
                    </div>

                    {/* Switch Regroupement */}
                    <div className="flex items-center justify-between space-x-2 border-t pt-3 border-border">
                      <Label htmlFor="grouped-mode" className="flex flex-col gap-1 cursor-pointer">
                        <span className="text-sm font-medium">Grouper l'affichage</span>
                        <span className="text-[10px] text-muted-foreground font-normal">Par sous-catégorie</span>
                      </Label>
                      <Switch
                        id="grouped-mode"
                        checked={isGrouped}
                        onCheckedChange={setIsGrouped}
                      />
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products Grid */}
      {/* Products Grid / Grouped View */}
      {filteredProducts.length > 0 ? (
        isGrouped ? (
          // --- VUE REGROUPÉE (ACCORDION) ---
          <Accordion type="multiple" defaultValue={Object.keys(groupedProducts)} className="space-y-4">
            {Object.entries(groupedProducts).map(([subCatId, group]) => (
              <AccordionItem key={subCatId} value={subCatId} className="border-none">
                <AccordionTrigger className="hover:no-underline py-2 px-4 bg-secondary/50 rounded-lg group">
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-lg">{group.name}</span>
                      <Badge variant="outline" className="bg-background">
                        {group.products.length} {group.products.length > 1 ? 'produits' : 'produit'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">
                        Stock Total:
                      </span>
                      <Badge className={group.totalStock > 0 ? "bg-emerald-500" : "bg-destructive"}>
                        {group.totalStock}
                      </Badge>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4 px-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {group.products.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          // --- VUE GRILLE SIMPLE ---
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )
      ) : (
        // --- VUE VIDE ---
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Package className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Aucun produit trouvé</h3>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" /> Ajouter un produit
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'Modifier le produit' : 'Ajouter un produit'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="name">Nom *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-input border-border"
                  data-testid="product-name-input"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="brand">Marque</Label>
                <Input
                  id="brand"
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  className="bg-input border-border"
                  data-testid="product-brand-input"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="barcode">Code-barres</Label>
                <Input
                  id="barcode"
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  className="bg-input border-border font-mono"
                  data-testid="product-barcode-input"
                />
              </div>
              <div>
                <Label htmlFor="quantity">Quantité</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })
                  }
                  className="bg-input border-border"
                  data-testid="product-quantity-input"
                />
              </div>
{/*               <div>
                <Label htmlFor="min_quantity">Quantité minimum</Label>
                <Input
                  id="min_quantity"
                  type="number"
                  min="0"
                  value={formData.min_quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, min_quantity: parseInt(e.target.value) || 0 })
                  }
                  className="bg-input border-border"
                  data-testid="product-min-quantity-input"
                />
              </div> */}
              <div>
                <Label htmlFor="unit">Unité</Label>
                <Select
                  value={formData.unit}
                  onValueChange={(value) => setFormData({ ...formData, unit: value })}
                >
                  <SelectTrigger className="bg-input border-border" data-testid="product-unit-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unité">unité</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="L">L</SelectItem>
                    <SelectItem value="mL">mL</SelectItem>
                    <SelectItem value="paquet">paquet</SelectItem>
                    <SelectItem value="boîte">boîte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="category">Catégorie</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                >
                  <SelectTrigger className="bg-input border-border" data-testid="product-category-select">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sub_category_id">Sous-catégorie</Label>
                <Select
                  value={formData.sub_category_id ? String(formData.sub_category_id) : "none"}
                  onValueChange={(value) => setFormData({
                    ...formData,
                    sub_category_id: value === "none" ? null : value
                  })}
                >
                  <SelectTrigger className="bg-input border-border" data-testid="product-subcategory-select">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Option pour désélectionner */}
                    <SelectItem value="none">Aucune</SelectItem>
                    {subCategories.map((sub) => (
                      <SelectItem key={sub.id} value={String(sub.id)}>
                        {sub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label htmlFor="location">Emplacement</Label>
                <Select
                  value={formData.location_id}
                  onValueChange={(value) => setFormData({ ...formData, location_id: value })}
                >
                  <SelectTrigger className="bg-input border-border" data-testid="product-location-select">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label htmlFor="image_url">URL de l'image</Label>
                <Input
                  id="image_url"
                  value={formData.image_url}
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  className="bg-input border-border"
                  placeholder="https://..."
                  data-testid="product-image-input"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-input border-border"
                  data-testid="product-description-input"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving} data-testid="save-product-btn">
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
            Êtes-vous sûr de vouloir supprimer le produit "{productToDelete?.name}" ?
            Cette action est irréversible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} data-testid="confirm-delete-btn">
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Dialog de configuration de la sous-catégorie */}
      <Dialog open={subCatDialogOpen} onOpenChange={setSubCatDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-card border-border">
          <DialogHeader>
            <DialogTitle>Configuration : {editingSubCat?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="threshold">Seuil d'alerte stock (commun à tous les produits)</Label>
              <Input
                id="threshold"
                type="number"
                value={subCatThreshold}
                onChange={(e) => setSubCatThreshold(parseInt(e.target.value) || 0)}
                className="bg-input border-border"
              />
              <p className="text-[11px] text-muted-foreground">
                Les produits de cette catégorie apparaîtront en "Stock bas" s'ils tombent sous ce nombre.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubCatDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleUpdateSubCatThreshold} disabled={updatingSubCat}>
              {updatingSubCat ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enregistrer le seuil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
