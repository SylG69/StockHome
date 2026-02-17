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
} from 'lucide-react';
import { Switch } from "@/components/ui/switch";

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

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    barcode: '',
    quantity: 0,
    min_quantity: 1,
    unit: 'unité',
    category_id: '',
    sub_category_name: '',
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

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      searchQuery === '' ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.brand?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      filterCategory === 'all' || product.category_id === filterCategory;

    const matchesLocation =
      filterLocation === 'all' || product.location_id === filterLocation;

    const matchesLowStock =
      !filterLowStock || product.quantity < product.min_quantity;

    const matchesAvailable = !hideOutOfStock || product.quantity > 0;

    return matchesSearch && matchesCategory && matchesLocation && matchesLowStock && matchesAvailable;
  });

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
        sub_category_name: product.sub_category_name || '',
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
        sub_category_name: '',
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
        sub_category_name: formData.sub_category_name || null,
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
            <div className="flex flex-wrap gap-3">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[180px] bg-input border-border" data-testid="filter-category">
                  <SelectValue placeholder="Catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes catégories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterLocation} onValueChange={setFilterLocation}>
                <SelectTrigger className="w-[180px] bg-input border-border" data-testid="filter-location">
                  <SelectValue placeholder="Emplacement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous emplacements</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 px-2 border-l border-border ml-2">
                <Label htmlFor="available-mode" className="text-sm text-muted-foreground cursor-pointer">
                  En stock
                </Label>
                <Switch
                  id="available-mode"
                  checked={hideOutOfStock}
                  onCheckedChange={setHideOutOfStock}
                />
              </div>
              <Button
                variant={filterLowStock ? 'default' : 'outline'}
                onClick={() => setFilterLowStock(!filterLowStock)}
                data-testid="filter-low-stock"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Stock bas
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products Grid */}
      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProducts.map((product, index) => (
            <Card
              key={product.id}
              className={`bg-card border-border card-hover animate-fade-in`}
              style={{ animationDelay: `${index * 0.05}s` }}
              data-testid={`product-card-${product.id}`}
            >
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
                  {product.sub_category_name}
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
                      data-testid={`decrease-qty-${product.id}`}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span
                      className={`text-lg font-bold min-w-[40px] text-center ${
                        product.quantity < product.min_quantity
                          ? 'text-destructive'
                          : 'text-emerald-500'
                      }`}
                    >
                      {product.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleQuantityChange(product, 1)}
                      data-testid={`increase-qty-${product.id}`}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    min: {product.min_quantity} {product.unit}
                  </span>
                </div>

                {product.quantity < product.min_quantity && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="w-3 h-3" />
                    Stock bas
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Package className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Aucun produit trouvé</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || filterCategory !== 'all' || filterLocation !== 'all' || filterLowStock
                ? 'Essayez de modifier vos filtres'
                : 'Commencez par ajouter votre premier produit'}
            </p>
            <Button onClick={() => handleOpenDialog()} data-testid="add-first-product-btn">
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un produit
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg bg-card border-border">
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
              <div>
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
              </div>
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
                  value={formData.sub_category_id ||"none"}
                  onValueChange={(value) => setFormData({ ...formData, sub_category_id: value === "none" ? null : value})}
                >
                  <SelectTrigger className="bg-input border-border" data-testid="product-subcategory-select">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Option pour désélectionner */}
                    <SelectItem value="none">Aucune</SelectItem>
                    {subCategories.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
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
    </div>
  );
}
