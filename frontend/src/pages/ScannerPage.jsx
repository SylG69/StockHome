import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from "@/components/ui/switch";
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
  ChevronsUpDown,
  ShoppingCart,
} from 'lucide-react';
// IMPORT DES HINTS ET DES FORMATS POUR LES OPTIMISATIONS DE VITESSE
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library';
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

  // Mode Retour de courses
  const [shoppingMode, setShoppingMode] = useState(false);

  // Scanned product state
  const [scannedProduct, setScannedProduct] = useState(null);
  const [openFoodFactsData, setOpenFoodFactsData] = useState(null);
  const [existingProduct, setExistingProduct] = useState(null);
  const [open, setOpen] = useState(false);

  // Dialog states
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // New product form
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    barcode: '',
    quantity: 1,
    min_quantity: 1,
    unit: 'unité',
    category_id: null,
    sub_category_id: null,
    sub_category_name: '',
    location_id: '',
    image_url: '',
    description: '',
    nutriscore_grade: null,
  });

  useEffect(() => {
    // --- OPTIMISATION : RESTREINDRE LES FORMATS RECHERCHÉS ---
    // Au lieu de tout chercher, on configure ZXing pour se focaliser UNIQUEMENT
    // sur les formats de produits de grande consommation (EAN et UPC).
    const hints = new Map();
    const formats = [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ];
    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);

    // On passe les configurations au lecteur au moment de son instanciation
    codeReader.current = new BrowserMultiFormatReader(hints);

    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    fetchData();
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
      setCameraActive(true);
      await codeReader.current.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, error) => {
          if (result) {
            handleBarcodeDetected(result.getText());
          }
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

  const playScanSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(950, audioCtx.currentTime);
      gain1.gain.setValueAtTime(0.4, audioCtx.currentTime);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start();
      osc1.stop(audioCtx.currentTime + 0.08);

      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1200, audioCtx.currentTime);
        gain2.gain.setValueAtTime(0.4, audioCtx.currentTime);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.08);
      }, 70);
    } catch (e) {
      console.error("Échec audio :", e);
    }
  };

  const handleBarcodeDetected = useCallback(async (barcode) => {
    if (searching) return;

    const wasCameraActive = cameraActive;
    stopCamera();
    setSearching(true);
    playScanSound();

    // --- LOGIQUE MODE COURSE ---
    if (shoppingMode) {
      try {
        let isExisting = false;
        let productName = '';

        try {
          const existingRes = await api.get(`/products/barcode/${barcode}`);
          const prod = existingRes.data;
          await api.patch(`/products/${prod.id}/quantity?delta=1`);
          productName = prod.name;
          isExisting = true;
        } catch (error) {}

        if (!isExisting) {
          let offData = null;
          try {
            const offRes = await api.get(`/barcode/${barcode}`);
            offData = offRes.data;
          } catch (e) {}

          const matchedCategory = offData?.suggested_category
            ? categories.find(c => c.name.toLowerCase() === offData.suggested_category.toLowerCase())
            : null;

          const fridgeLocation = offData?.needs_refrigeration
            ? locations.find(l => /r[ée]frig[ée]rateur|frigo/i.test(l.name))
            : null;

          const offSuggestions = offData?.sub_categories_suggestions || [];
          let matchedSubCategoryId = null;
          for (const suggestion of offSuggestions) {
            const found = subcategories.find(s => s.name.toLowerCase() === suggestion.toLowerCase());
            if (found) {
              matchedSubCategoryId = found.id;
              break;
            }
          }

          const newProductData = {
            name: offData?.name || `Produit inconnu (${barcode})`,
            brand: offData?.brand || '',
            barcode: barcode,
            quantity: 1,
            min_quantity: 1,
            unit: 'unité',
            category_id: matchedCategory?.id || categories[0]?.id || null,
            sub_category_id: matchedSubCategoryId,
            sub_category_name: offSuggestions.length > 0 ? offSuggestions[0] : '',
            location_id: fridgeLocation?.id || locations[0]?.id || 'none',
            image_url: offData?.image_url || '',
            description: offData?.categories || '',
            nutriscore_grade: offData?.nutriscore_grade || null,
          };

          await api.post('/products', newProductData);
          productName = newProductData.name;
        }

        toast.success(`+1 ajouté : ${productName}`);
        setManualBarcode('');
      } catch (err) {
        toast.error("Erreur lors de l'ajout automatique");
      } finally {
        setSearching(false);
        if (wasCameraActive) {
          setTimeout(() => startCamera(), 300);
        }
      }
      return;
    }

    // --- LOGIQUE MODE CLASSIQUE ---
    setScannedProduct({ barcode });
    setOpenFoodFactsData(null);
    setExistingProduct(null);

    try {
      try {
        const existingRes = await api.get(`/products/barcode/${barcode}`);
        setExistingProduct(existingRes.data);
        setResultDialogOpen(true);
        setSearching(false);
        return;
      } catch (error) {}

      try {
        const offRes = await api.get(`/barcode/${barcode}`);
        setOpenFoodFactsData(offRes.data);
        const offSuggestions = offRes.data.sub_categories_suggestions || [];
        setSuggestions(offSuggestions);

        let matchedSubCategoryId = null;
        for (const suggestion of offSuggestions) {
          const found = subcategories.find(s => s.name.toLowerCase() === suggestion.toLowerCase());
          if (found) { matchedSubCategoryId = found.id; break; }
        }

        const matchedCategory = offRes.data.suggested_category
          ? categories.find(c => c.name.toLowerCase() === offRes.data.suggested_category.toLowerCase())
          : null;

        const fridgeLocation = offRes.data.needs_refrigeration
          ? locations.find(l => /r[ée]frig[ée]rateur|frigo/i.test(l.name))
          : null;

        setFormData({
          name: offRes.data.name || '',
          brand: offRes.data.brand || '',
          barcode: barcode,
          quantity: 1,
          min_quantity: 1,
          unit: 'unité',
          category_id: matchedCategory ? matchedCategory.id : null,
          location_id: fridgeLocation ? fridgeLocation.id : null,
          image_url: offRes.data.image_url || '',
          sub_category_id: matchedSubCategoryId,
          sub_category_name: offSuggestions.length > 0 ? offSuggestions[0] : '',
          description: offRes.data.categories || '',
          nutriscore_grade: offRes.data.nutriscore_grade || null,
        });
      } catch (error) {
        setFormData({
          name: '', brand: '', barcode: barcode, quantity: 1, min_quantity: 1, unit: 'unité',
          category_id: null, location_id: null, image_url: '', sub_category_id: null, sub_category_name: '', description: '',
          nutriscore_grade: null,
        });
      }

      setResultDialogOpen(true);
    } catch (error) {
      toast.error('Erreur lors de la recherche');
    } finally {
      setSearching(false);
    }
  }, [searching, cameraActive, shoppingMode, categories, subcategories, locations, api]);

  const handleManualSearch = () => {
    if (!manualBarcode.trim()) {
      toast.error('Entrez un code-barres');
      return;
    }
    handleBarcodeDetected(manualBarcode.trim());
  };

  // Lecteur physique USB
  useEffect(() => {
    let buffer = '';
    let timeout = null;

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => { buffer = ''; }, 100);

      if (e.key === 'Enter' && buffer.length > 5) {
        handleBarcodeDetected(buffer);
        buffer = '';
        return;
      }

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

  const handleCloseDialog = () => {
    setResultDialogOpen(false);
    setTimeout(() => startCamera(), 200);
  };

  const handleUpdateQuantity = async (delta) => {
    if (!existingProduct) return;
    try {
      const response = await api.patch(`/products/${existingProduct.id}/quantity?delta=${delta}`);
      setExistingProduct({ ...existingProduct, quantity: response.data.quantity });
      toast.success(`Quantité mise à jour : ${response.data.quantity}`);
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const handleSaveNewProduct = async () => {
    const missing = [];
    if (formData.quantity === '' || formData.quantity === null || formData.quantity === undefined) missing.push('Quantité');
    if (!formData.category_id) missing.push('Catégorie');
    if (!formData.location_id || formData.location_id === 'none') missing.push('Emplacement');

    if (missing.length > 0) {
      toast.error(`Champs obligatoires manquants : ${missing.join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      await api.post('/products', formData);
      toast.success("Produit ajouté au stock");
      // On reste sur la page Scanner (pas de redirection vers /products) :
      // on ferme le dialogue et on relance la caméra si elle était active,
      // comme le fait déjà handleCloseDialog pour le dialogue "produit existant".
      setResultDialogOpen(false);
      setScannedProduct(null);
      setOpenFoodFactsData(null);
      setManualBarcode('');
      setTimeout(() => startCamera(), 200);
    } catch (error) {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="scanner-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Scanner</h1>
        <p className="text-muted-foreground mt-1">Scannez un code-barres pour ajouter ou mettre à jour un produit</p>
      </div>

      {/* Mode Retour de courses */}
      <Card className={cn("bg-card border transition-all duration-300", shoppingMode ? "border-primary/60 bg-primary/5 shadow-md" : "border-border")}>
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn("p-2.5 rounded-lg", shoppingMode ? "bg-primary/20 text-primary animate-pulse" : "bg-muted text-muted-foreground")}>
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm">Mode "Retour de courses"</h2>
                {shoppingMode && <Badge className="text-[9px] h-4 uppercase bg-primary">Actif</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Bip sonore, incrémentation automatique et enregistrement instantané en arrière-plan.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label htmlFor="shopping-mode" className="text-xs font-black uppercase text-muted-foreground">{shoppingMode ? "Activé" : "Désactivé"}</Label>
            <Switch id="shopping-mode" checked={shoppingMode} onCheckedChange={setShoppingMode} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Caméra */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5" /> Scanner avec la caméra
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="scanner-container bg-black rounded-lg overflow-hidden mb-4 relative">
              <div className={cameraActive ? 'relative' : 'hidden'}>
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-64 object-cover" />
                <div className="scanner-overlay" />
              </div>
              {!cameraActive && (
                <div className="w-full h-64 flex flex-col items-center justify-center bg-secondary/20">
                  {cameraError ? (
                    <>
                      <AlertCircle className="w-12 h-12 text-destructive mb-3" />
                      <p className="text-sm text-muted-foreground text-center px-4">{cameraError}</p>
                    </>
                  ) : (
                    <>
                      <CameraOff className="w-12 h-12 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">Caméra désactivée</p>
                    </>
                  )}
                </div>
              )}
            </div>
            <Button className="w-full" variant={cameraActive ? 'destructive' : 'default'} onClick={cameraActive ? stopCamera : startCamera} data-testid="toggle-camera-btn">
              {cameraActive ? <><CameraOff className="w-4 h-4 mr-2" /> Arrêter la caméra</> : <><Camera className="w-4 h-4 mr-2" /> Démarrer la caméra</>}
            </Button>
          </CardContent>
        </Card>

        {/* Manuel / USB */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="w-5 h-5" /> Saisie manuelle / Lecteur USB
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-secondary/20 border border-dashed border-border">
                <div className="flex items-center gap-3 mb-2">
                  <ScanLine className="w-5 h-5 text-primary" />
                  <span className="font-medium">Lecteur USB</span>
                </div>
                <p className="text-sm text-muted-foreground">Si vous utilisez un lecteur USB, scannez directement le produit.</p>
              </div>

              <div>
                <Label htmlFor="manual-barcode">Ou saisissez le code manuellement</Label>
                <div className="flex gap-2 mt-2">
                  <Input ref={manualInputRef} id="manual-barcode" value={manualBarcode} onChange={(e) => setManualBarcode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()} placeholder="Ex: 3017620422003" className="font-mono" data-testid="manual-barcode-input" />
                  <Button onClick={handleManualSearch} disabled={searching} data-testid="search-barcode-btn">
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notice */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-3">Comment ça marche ?</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><span className="text-sm font-bold text-primary">1</span></div>
              <div>
                <p className="font-medium text-sm">Scannez le code-barres</p>
                <p className="text-xs text-muted-foreground">Caméra optimisée, lecteur USB ou saisie manuelle.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><span className="text-sm font-bold text-primary">2</span></div>
              <div>
                <p className="font-medium text-sm">Vérifiez ou stockez en chaîne</p>
                <p className="text-xs text-muted-foreground">Le mode classique affiche la fiche, le mode course automatise l'action.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><span className="text-sm font-bold text-primary">3</span></div>
              <div>
                <p className="font-medium text-sm">Ajoutez à votre stock</p>
                <p className="text-xs text-muted-foreground">Définissez la quantité globale et l'emplacement.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Produit Existant */}
      <Dialog open={resultDialogOpen && existingProduct} onOpenChange={handleCloseDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Check className="w-5 h-5 text-emerald-500" /> Produit trouvé dans votre stock</DialogTitle>
          </DialogHeader>
          {existingProduct && (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                {existingProduct.image_url ? (
                  <img src={existingProduct.image_url} alt={existingProduct.name} className="w-20 h-20 rounded-lg object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-secondary flex items-center justify-center"><Package className="w-10 h-10 text-muted-foreground" /></div>
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{existingProduct.name}</h3>
                  <p className="text-sm text-muted-foreground">{existingProduct.brand || 'Sans marque'}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">{existingProduct.barcode}</p>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-sm text-muted-foreground mb-2 text-center">Quantité en stock</p>
                <div className="flex items-center justify-center gap-4">
                  <Button variant="outline" size="icon" onClick={() => handleUpdateQuantity(-1)} disabled={existingProduct.quantity <= 0}><Minus className="w-4 h-4" /></Button>
                  <span className={`text-3xl font-bold ${existingProduct.quantity < existingProduct.min_quantity ? 'text-destructive' : 'text-emerald-500'}`}>{existingProduct.quantity}</span>
                  <Button variant="outline" size="icon" onClick={() => handleUpdateQuantity(1)}><Plus className="w-4 h-4" /></Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>Fermer</Button>
            <Button onClick={() => navigate('/products')}>Voir les produits</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Nouveau Produit */}
      <Dialog open={resultDialogOpen && !existingProduct} onOpenChange={handleCloseDialog}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle>{openFoodFactsData ? 'Produit trouvé' : 'Nouveau produit'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {openFoodFactsData ? (
              <div className="flex items-start gap-4 p-4 rounded-lg bg-secondary/30">
                {openFoodFactsData.image_url ? (
                  <img src={openFoodFactsData.image_url} alt={openFoodFactsData.name} className="w-20 h-20 rounded-lg object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-secondary flex items-center justify-center"><Package className="w-10 h-10 text-muted-foreground" /></div>
                )}
                <div className="flex-1">
                  <Badge className="mb-2">{openFoodFactsData.source || 'Base partenaire'}</Badge>
                  <h3 className="font-semibold">{openFoodFactsData.name || 'Produit inconnu'}</h3>
                  <p className="text-sm text-muted-foreground">{openFoodFactsData.brand || 'Sans marque'}</p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-sm text-amber-500">Produit non répertorié. Saisie manuelle possible.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nom *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Marque</Label>
                <Input value={formData.brand} onChange={(e) => setFormData({ ...formData, brand: e.target.value })} />
              </div>
              <div>
                <Label>Quantité *</Label>
                <Input type="number" min="0" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Catégorie *</Label>
                <Select value={formData.category_id} onValueChange={(value) => setFormData({ ...formData, category_id: value })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>{categories.map((cat) => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sous-catégorie</Label>
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <button role="combobox" aria-expanded={open} className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-input px-3 py-2 text-sm shadow-sm">
                      {formData.sub_category_name || "Chercher..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                    <Command>
                      <CommandInput placeholder="Rechercher..." onValueChange={(t) => setFormData({ ...formData, sub_category_name: t.charAt(0).toUpperCase() + t.slice(1) })} />
                      <CommandList>
                        <CommandEmpty className="p-2">
                          <Button variant="ghost" size="sm" className="w-full justify-start text-primary" onClick={() => setOpen(false)}><Plus className="mr-2 h-4 w-4" />Créer "{formData.sub_category_name}"</Button>
                        </CommandEmpty>
                        <CommandGroup>
                          {subcategories.map((sub) => (
                            <CommandItem key={sub.id} value={sub.name} onSelect={() => { setFormData({ ...formData, sub_category_id: sub.id, sub_category_name: sub.name }); setOpen(false); }}>
                              <Check className={cn("mr-2 h-4 w-4", formData.sub_category_id === sub.id ? "opacity-100" : "opacity-0")} />{sub.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Emplacement *</Label>
                <Select value={formData.location_id} onValueChange={(value) => setFormData({ ...formData, location_id: value })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>{locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>Annuler</Button>
            <Button onClick={handleSaveNewProduct} disabled={saving}>{saving ? 'Enregistrement...' : 'Ajouter au stock'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}