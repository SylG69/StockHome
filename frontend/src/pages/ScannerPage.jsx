import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { toast } from 'sonner';
import {
  ScanLine,
  Camera,
  CameraOff,
  Keyboard,
  Search,
  Package,
  Plus,
  Minus,
  Loader2,
  AlertCircle,
  Check,
  X,
  ChevronsUpDown,
} from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/library';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export default function ScannerPage() {
  const { api } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const codeReader = useRef(null);
  const manualInputRef = useRef(null);

  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  // Scanned product state
  const [scannedProduct, setScannedProduct] = useState(null);
  const [openFoodFactsData, setOpenFoodFactsData] = useState(null);
  const [existingProduct, setExistingProduct] = useState(null);
  const [open, setOpen] = useState(false);
  const allPossibleSubCats = Array.from(new Set([
  ...(Array.isArray(suggestions) ? suggestions : []),
  ...(Array.isArray(subcategories) ? subcategories.map(s => s.name) : [])
  ]));

  // Dialog states
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // New product form
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    barcode: '',
    quantity: 1,
    min_quantity: 1,
    unit: 'unité',
    sub_category_id: null,
    sub_category_name: '',
    location_id: '',
    image_url: '',
    description: '',
  });

  useEffect(() => {
    fetchData();
    codeReader.current = new BrowserMultiFormatReader();

    return () => {
      stopCamera();
    };
  }, []);

  const fetchData = async () => {
    try {
      const [categoriesRes, locationsRes, subcategoriesRes] = await Promise.all([
        api.get('/categories'),
        api.get('/locations'),
        api.get('/subcategories'),
      ]);
      setCategories(categoriesRes.data);
      setLocations(locationsRes.data);
      setSubcategories(subcategoriesRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      setCameraActive(true); // On active l'interface d'abord

      // On utilise null pour le premier argument pour laisser ZXing choisir la caméra par défaut (arrière)
      // On passe la vidéoRef.current pour que ZXing sache où afficher le flux
      await codeReader.current.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, error) => {
          if (result) {
            handleBarcodeDetected(result.getText());
          }
          // L'erreur ici est normale tant qu'aucun code n'est détecté,
          // on ne logge rien pour éviter de spammer la console
        }
      );
    } catch (error) {
      console.error('Camera error:', error);
      setCameraError("Impossible d'accéder à la caméra. Vérifiez les permissions.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    if (codeReader.current) {
      codeReader.current.reset();
    }
    setCameraActive(false);
  };

  const handleBarcodeDetected = useCallback(async (barcode) => {
    if (searching) return;

    // Stop camera when barcode detected
    stopCamera();

    setSearching(true);
    setScannedProduct({ barcode });
    setOpenFoodFactsData(null);
    setExistingProduct(null);

    try {
      // Check if product already exists in inventory
      try {
        const existingRes = await api.get(`/products/barcode/${barcode}`);
        setExistingProduct(existingRes.data);
        setResultDialogOpen(true);
        setSearching(false);
        return;
      } catch (error) {
        // Product not found in inventory, continue to Open Food Facts
      }

      // Look up in Open Food Facts
      try {
        const offRes = await api.get(`/barcode/${barcode}`);
        setOpenFoodFactsData(offRes.data);
        // On récupère les suggestions envoyées par le backend
        const offSuggestions = offRes.data.sub_categories_suggestions || [];
        setSuggestions(offSuggestions);
        setFormData({
          name: offRes.data.name || '',
          brand: offRes.data.brand || '',
          barcode: barcode,
          quantity: 1,
          min_quantity: 1,
          unit: 'unité',
          category_id: '',
          location_id: '',
          image_url: offRes.data.image_url || '',
          // On peut pré-remplir avec la suggestion la plus précise par défaut
          sub_category_name: offSuggestions.length > 0 ? offSuggestions[offSuggestions.length - 1] : '',
          description: offRes.data.categories || '',
        });
      } catch (error) {
        logger.error('Open Food Facts error:', error);
        setFormData({
          ...formData,
          barcode: barcode,
          name: '',
          brand: '',
          image_url: '',
          description: '',
        });
      }

      setResultDialogOpen(true);
    } catch (error) {
      toast.error('Erreur lors de la recherche');
    } finally {
      setSearching(false);
    }
  }, [searching, api, formData]);

  const handleManualSearch = () => {
    if (!manualBarcode.trim()) {
      toast.error('Entrez un code-barres');
      return;
    }
    handleBarcodeDetected(manualBarcode.trim());
  };

  // Handle USB barcode scanner input
  useEffect(() => {
    let buffer = '';
    let timeout = null;

    const handleKeyDown = (e) => {
      // Ignore if typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Clear buffer after 100ms of inactivity
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        buffer = '';
      }, 100);

      // Enter key signals end of barcode
      if (e.key === 'Enter' && buffer.length > 5) {
        handleBarcodeDetected(buffer);
        buffer = '';
        return;
      }

      // Add to buffer if it's a valid barcode character
      if (/^[0-9]$/.test(e.key)) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeout) clearTimeout(timeout);
    };
  }, [handleBarcodeDetected]);

  const handleUpdateQuantity = async (delta) => {
    if (!existingProduct) return;

    try {
      const response = await api.patch(
        `/products/${existingProduct.id}/quantity?delta=${delta}`
      );
      setExistingProduct({
        ...existingProduct,
        quantity: response.data.quantity,
      });
      toast.success(`Quantité mise à jour: ${response.data.quantity}`);
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const handleSaveNewProduct = async () => {
    if (!formData.name.trim()) {
      toast.error('Le nom du produit est requis');
      return;
    }

    setSaving(true);
    try {
      await api.post('/products', {
        ...formData,
        sub_category_name: formData.sub_category_name || null,
        category_id: formData.category_id || null,
        location_id: formData.location_id || null,
        // sub_category_id: formData.sub_category_id || null,
      });
      toast.success('Produit ajouté à votre inventaire');
      setResultDialogOpen(false);
      setAddDialogOpen(false);
      setManualBarcode('');
    } catch (error) {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="scanner-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Scanner</h1>
        <p className="text-muted-foreground mt-1">
          Scannez un code-barres pour ajouter ou mettre à jour un produit
        </p>
      </div>

      {/* Scanner Options */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Camera Scanner */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5" />
              Scanner avec la caméra
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="scanner-container bg-black rounded-lg overflow-hidden mb-4">
              {cameraActive ? (
                <div className="relative">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-64 object-cover"
                  />
                  <div className="scanner-overlay" />
                </div>
              ) : (
                <div className="w-full h-64 flex flex-col items-center justify-center bg-secondary/20">
                  {cameraError ? (
                    <>
                      <AlertCircle className="w-12 h-12 text-destructive mb-3" />
                      <p className="text-sm text-muted-foreground text-center px-4">
                        {cameraError}
                      </p>
                    </>
                  ) : (
                    <>
                      <CameraOff className="w-12 h-12 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Caméra désactivée
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
            <Button
              className={`w-full ${cameraActive ? '' : 'btn-glow'}`}
              variant={cameraActive ? 'destructive' : 'default'}
              onClick={cameraActive ? stopCamera : startCamera}
              data-testid="toggle-camera-btn"
            >
              {cameraActive ? (
                <>
                  <CameraOff className="w-4 h-4 mr-2" />
                  Arrêter la caméra
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 mr-2" />
                  Démarrer la caméra
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Manual Input / USB Scanner */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="w-5 h-5" />
              Saisie manuelle / Lecteur USB
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-secondary/20 border border-dashed border-border">
                <div className="flex items-center gap-3 mb-2">
                  <ScanLine className="w-5 h-5 text-primary" />
                  <span className="font-medium">Lecteur USB</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Si vous utilisez un lecteur de code-barres USB, scannez simplement
                  le produit. Le code sera automatiquement détecté.
                </p>
              </div>

              <div className="relative">
                <Label htmlFor="manual-barcode">Ou saisissez le code manuellement</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    ref={manualInputRef}
                    id="manual-barcode"
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                    placeholder="Ex: 3017620422003"
                    className="bg-input border-border font-mono"
                    data-testid="manual-barcode-input"
                  />
                  <Button
                    onClick={handleManualSearch}
                    disabled={searching}
                    data-testid="search-barcode-btn"
                  >
                    {searching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-3">Comment ça marche ?</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-primary">1</span>
              </div>
              <div>
                <p className="font-medium text-sm">Scannez le code-barres</p>
                <p className="text-xs text-muted-foreground">
                  Utilisez la caméra, un lecteur USB ou saisissez le code
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-primary">2</span>
              </div>
              <div>
                <p className="font-medium text-sm">Vérifiez les informations</p>
                <p className="text-xs text-muted-foreground">
                  Les données sont récupérées automatiquement via Open Food Facts
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-primary">3</span>
              </div>
              <div>
                <p className="font-medium text-sm">Ajoutez à votre stock</p>
                <p className="text-xs text-muted-foreground">
                  Définissez la quantité et l'emplacement de stockage
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Result Dialog - Existing Product */}
      <Dialog open={resultDialogOpen && existingProduct} onOpenChange={setResultDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-emerald-500" />
              Produit trouvé dans votre stock
            </DialogTitle>
          </DialogHeader>
          {existingProduct && (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                {existingProduct.image_url ? (
                  <img
                    src={existingProduct.image_url}
                    alt={existingProduct.name}
                    className="w-20 h-20 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-secondary flex items-center justify-center">
                    <Package className="w-10 h-10 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{existingProduct.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {existingProduct.brand || 'Sans marque'}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    {existingProduct.barcode}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-sm text-muted-foreground mb-2">Quantité en stock</p>
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleUpdateQuantity(-1)}
                    disabled={existingProduct.quantity <= 0}
                    data-testid="decrease-existing-qty"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span
                    className={`text-3xl font-bold ${
                      existingProduct.quantity < existingProduct.min_quantity
                        ? 'text-destructive'
                        : 'text-emerald-500'
                    }`}
                  >
                    {existingProduct.quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleUpdateQuantity(1)}
                    data-testid="increase-existing-qty"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Minimum: {existingProduct.min_quantity} {existingProduct.unit}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResultDialogOpen(false)}>
              Fermer
            </Button>
            <Button onClick={() => navigate('/products')} data-testid="go-to-products-btn">
              Voir les produits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result Dialog - New Product / Open Food Facts */}
      <Dialog open={resultDialogOpen && !existingProduct} onOpenChange={setResultDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {openFoodFactsData ? 'Produit trouvé' : 'Nouveau produit'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {openFoodFactsData ? (
              <div className="flex items-start gap-4 p-4 rounded-lg bg-secondary/30">
                {openFoodFactsData.image_url ? (
                  <img
                    src={openFoodFactsData.image_url}
                    alt={openFoodFactsData.name}
                    className="w-20 h-20 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-secondary flex items-center justify-center">
                    <Package className="w-10 h-10 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <Badge className="mb-2">Open Food Facts</Badge>
                  <h3 className="font-semibold">{openFoodFactsData.name || 'Produit inconnu'}</h3>
                  <p className="text-sm text-muted-foreground">
                    {openFoodFactsData.brand || 'Sans marque'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-sm text-amber-500">
                  Produit non trouvé dans Open Food Facts. Vous pouvez le créer manuellement.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nom *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-input border-border"
                  data-testid="scanner-product-name"
                />
              </div>
              <div className="col-span-2">
                <Label>Marque</Label>
                <Input
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  className="bg-input border-border"
                />
              </div>
              <div>
                <Label>Quantité</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })
                  }
                  className="bg-input border-border"
                  data-testid="scanner-product-quantity"
                />
              </div>
              <div>
                <Label>Quantité min.</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.min_quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, min_quantity: parseInt(e.target.value) || 0 })
                  }
                  className="bg-input border-border"
                />
              </div>
              <div>
                <Label>Catégorie</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                >
                  <SelectTrigger className="bg-input border-border">
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
                <Label>Sous-catégorie</Label>
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <button
                      role="combobox"
                      aria-expanded={open}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-input px-3 py-2 text-sm shadow-sm"
                    >
                      {formData.sub_category_name || "Chercher ou saisir une précision..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </button>
                  </PopoverTrigger>

                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                    <Command>
                      <CommandInput
                        placeholder="Rechercher une sous-catégorie..."
                        onValueChange={(searchTerm) => {
                          // Mise à jour pour permettre la saisie manuelle en direct
                          const formattedTerm = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1);
                          setFormData({ ...formData, sub_category_name: formattedTerm });
                        }}
                      />
                      <CommandList>
                        <CommandEmpty className="p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-primary"
                            onClick={() => setOpen(false)}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Créer "{formData.sub_category_name}"
                          </Button>
                        </CommandEmpty>

                        <CommandGroup title="Suggestions">
                          {allPossibleSubCats.map((name) => (
                            <CommandItem
                              key={name}
                              value={name}
                              onSelect={(currentValue) => {
                                setFormData({ ...formData, sub_category_name: currentValue });
                                setOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  formData.sub_category_name === name ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {name}
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
                  value={formData.location_id}
                  onValueChange={(value) => setFormData({ ...formData, location_id: value })}
                >
                  <SelectTrigger className="bg-input border-border">
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
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResultDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSaveNewProduct} disabled={saving} data-testid="save-scanned-product-btn">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter au stock
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
