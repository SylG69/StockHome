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
  ChevronsUpDown,
  ShoppingCart,
  SwitchCamera,
  Flashlight,
  FlashlightOff,
  Inbox,
  X,
  Pencil,
  PackageMinus,
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
  // Toujours à jour vers la dernière version de handleBarcodeDetected (voir
  // useEffect plus bas). Indispensable car la boucle de détection (native ou
  // ZXing) est créée UNE SEULE FOIS au démarrage de la caméra et tourne en
  // continu sans jamais être recréée : sans cette ref, elle garderait pour
  // toujours la version de handleBarcodeDetected (et donc le scanMode) telle
  // qu'elle était au moment du démarrage, ignorant tout changement de mode
  // (course/consommation/ajout) tant que la caméra reste allumée.
  const handleBarcodeDetectedRef = useRef(null);
  // Détection native (rapide, matérielle) via l'API BarcodeDetector du
  // navigateur -- utilisée en priorité, ZXing sert de repli automatique
  // pour les navigateurs qui ne la supportent pas (Firefox, anciens Safari).
  const barcodeDetectorRef = useRef(null);
  const rafIdRef = useRef(null);
  const streamRef = useRef(null);
  // Piste vidéo active, utilisée pour piloter le flash (applyConstraints)
  // indépendamment du moteur de détection utilisé (natif ou ZXing).
  const videoTrackRef = useRef(null);
  // Mémorise l'identifiant de caméra (deviceId) effectivement utilisé pour
  // chaque sens ('environment'/'user') une fois trouvé, pour un changement
  // de caméra fiable et instantané ensuite -- la contrainte facingMode seule
  // est mal respectée par certains navigateurs/appareils (bascule parfois
  // toujours sur la caméra frontale malgré la demande "environment").
  const knownDeviceIdsRef = useRef({});
  // Anti-doublon : la caméra restant allumée en continu en mode course, un
  // même produit encore visible dans le champ juste après son ajout serait
  // sinon re-détecté immédiatement. On ignore un code déjà scanné pendant
  // ce délai.
  const lastScanRef = useRef({ code: null, time: 0 });
  const SCAN_COOLDOWN_MS = 2000;
  // Formats acceptés : uniquement les codes-barres produits de grande
  // consommation (ceux référencés par Open Food Facts) -- ni QR code, ni
  // Code128/Data Matrix/etc. Utilisé à la fois pour BarcodeDetector natif
  // et pour les hints ZXing en repli.
  const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  // Caméra avant/arrière et flash (torche), disponibles uniquement quand la
  // caméra tourne et, pour le flash, seulement si l'appareil le supporte.
  const [facingMode, setFacingMode] = useState('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  // Mode de scan : 'add' (classique, ouvre une fiche à compléter),
  // 'shopping' (Retour de courses, +1 auto), 'consume' (Consommation, -1
  // auto). Un seul actif à la fois, pour éviter toute ambiguïté.
  const [scanMode, setScanMode] = useState('add');

  // Zone tampon : scans en mode course non trouvés en stock ET non trouvés
  // sur Open Food Facts -- on ne crée plus de produit générique "Produit
  // inconnu" pour eux (pour ne pas polluer la page Produits), on les met de
  // côté ici pour un traitement manuel ultérieur. Persisté en localStorage
  // pour ne pas les perdre en cas de rechargement accidentel pendant les courses.
  const [unmatchedBuffer, setUnmatchedBuffer] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('scanner_unmatched_buffer') || '[]');
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('scanner_unmatched_buffer', JSON.stringify(unmatchedBuffer));
  }, [unmatchedBuffer]);

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
    price: '',
  });
  // Prix moyen indicatif (Open Prices) pour le produit en cours de scan --
  // affiché à titre informatif uniquement, jamais imposé : formData.price
  // reste la valeur réellement enregistrée et librement modifiable.
  const [suggestedPrice, setSuggestedPrice] = useState(null);

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

  // Construit la contrainte vidéo pour un sens de caméra donné : priorité
  // absolue au deviceId déjà connu pour ce sens (garantit de retomber sur la
  // même caméra physique), sinon facingMode en tant que PRÉFÉRENCE ("ideal").
  // Une simple chaîne (facingMode: 'environment') est mal respectée par
  // certains navigateurs/navigateurs embarqués -- bug très documenté qui
  // fait souvent rester sur la caméra frontale malgré la demande -- la forme
  // { ideal: ... } est nettement plus fiable.
  const buildVideoConstraint = (facing) => {
    const knownId = knownDeviceIdsRef.current[facing];
    if (knownId) {
      return { deviceId: { exact: knownId } };
    }
    return { facingMode: { ideal: facing } };
  };

  const startCamera = async (facing = facingMode) => {
    setCameraError(null);
    try {
      setCameraActive(true);

      // 1. Tentative avec l'API native BarcodeDetector (Chrome/Edge/Android,
      // Safari 17+) : bien plus rapide car matérielle/OS, pas de librairie
      // JS à faire tourner sur chaque frame.
      let useNative = false;
      if ('BarcodeDetector' in window) {
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          const formats = BARCODE_FORMATS.filter((f) => supported.includes(f));
          if (formats.length > 0) {
            barcodeDetectorRef.current = new window.BarcodeDetector({ formats });
            useNative = true;
          }
        } catch (e) {
          useNative = false;
        }
      }

      if (useNative) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: buildVideoConstraint(facing),
        });
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const detectLoop = async () => {
          if (!barcodeDetectorRef.current || !videoRef.current) return;
          try {
            const results = await barcodeDetectorRef.current.detect(videoRef.current);
            if (results.length > 0) {
              // Toujours via la ref : la boucle est créée une seule fois et
              // ne doit jamais garder une version figée du handler (sinon un
              // changement de scanMode pendant que la caméra tourne serait
              // ignoré -- voir le commentaire sur handleBarcodeDetectedRef).
              handleBarcodeDetectedRef.current?.(results[0].rawValue);
            }
          } catch (e) {
            // Frame non exploitable (transitoire, ex: vidéo pas encore
            // prête) : on ignore et on continue la boucle.
          }
          rafIdRef.current = requestAnimationFrame(detectLoop);
        };
        rafIdRef.current = requestAnimationFrame(detectLoop);
      } else {
        // 2. Repli ZXing (déjà restreint aux formats EAN/UPC via les hints
        // configurés à l'instanciation, voir useEffect plus haut).
        // decodeFromConstraints (plutôt que decodeFromVideoDevice) permet de
        // choisir la caméra avant/arrière via facingMode.
        await codeReader.current.decodeFromConstraints(
          { video: buildVideoConstraint(facing) },
          videoRef.current,
          (result, error) => {
            if (result) {
              handleBarcodeDetectedRef.current?.(result.getText());
            }
          }
        );
      }

      // Récupère la piste vidéo active (quel que soit le moteur utilisé, le
      // flux est de toute façon attaché à videoRef.current.srcObject) pour
      // piloter le flash, et détecte s'il est supporté par l'appareil.
      const track = videoRef.current?.srcObject?.getVideoTracks?.()[0] || null;
      videoTrackRef.current = track;
      const capabilities = track?.getCapabilities?.() || {};
      setTorchSupported(!!capabilities.torch);
      setTorchOn(false);

      // Mémorise l'identifiant de la caméra effectivement obtenue pour ce
      // sens : les prochains changements de caméra vers ce même sens
      // redemanderont ce deviceId précis plutôt que de refaire confiance à
      // facingMode, garantissant qu'on retombe bien sur la bonne caméra.
      const activeDeviceId = track?.getSettings?.()?.deviceId;
      if (activeDeviceId) {
        knownDeviceIdsRef.current[facing] = activeDeviceId;
      }
    } catch (error) {
      console.error('Camera error:', error);
      setCameraError("Impossible d'accéder à la caméra. Vérifiez les permissions.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    if (codeReader.current) {
      codeReader.current.reset();
    }
    videoTrackRef.current = null;
    setTorchSupported(false);
    setTorchOn(false);
    setCameraActive(false);
  };

  const toggleTorch = async () => {
    const track = videoTrackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch (e) {
      toast.error("Le flash n'est pas disponible sur cet appareil");
      setTorchSupported(false);
    }
  };

  const switchCamera = async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    stopCamera();
    setFacingMode(nextFacing);
    await startCamera(nextFacing);
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

    // Anti-doublon : même code détecté deux fois de suite en moins de
    // SCAN_COOLDOWN_MS (typiquement le même produit encore dans le champ de
    // la caméra) -> on ignore, plutôt que de l'ajouter deux fois.
    const now = Date.now();
    if (barcode === lastScanRef.current.code && now - lastScanRef.current.time < SCAN_COOLDOWN_MS) {
      return;
    }
    lastScanRef.current = { code: barcode, time: now };

    setSearching(true);
    playScanSound();

    // --- LOGIQUE MODE CONSOMMATION ---
    // La caméra reste allumée en continu, comme en mode course. On ne
    // touche jamais à Open Food Facts ni à la zone tampon ici : on
    // décrémente uniquement un produit déjà présent dans le stock.
    if (scanMode === 'consume') {
      try {
        const existingRes = await api.get(`/products/barcode/${barcode}`);
        const prod = existingRes.data;
        if (prod.quantity <= 0) {
          toast.warning(`${prod.name} : stock déjà à 0`);
        } else {
          await api.patch(`/products/${prod.id}/quantity?delta=-1`);
          const remaining = prod.quantity - 1;
          toast.success(`-1 : ${prod.name} (${remaining} ${prod.unit || ''} restant${remaining > 1 ? 's' : ''})`);
        }
      } catch (error) {
        toast.error(`Produit non trouvé dans votre stock (code ${barcode})`);
      } finally {
        setSearching(false);
      }
      return;
    }

    // --- LOGIQUE MODE COURSE ---
    // La caméra n'est JAMAIS coupée ici : elle reste allumée en continu
    // pendant tout le mode course (voir cooldown anti-doublon ci-dessus).
    if (scanMode === 'shopping') {
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

          if (!offData) {
            // Ni en stock, ni trouvé sur Open Food Facts : on ne crée PAS de
            // produit générique "Produit inconnu" (ça polluait la page
            // Produits). On le met de côté dans la zone tampon pour un
            // traitement manuel ultérieur (bouton "Compléter" plus bas).
            setUnmatchedBuffer((prev) => {
              if (prev.some((entry) => entry.barcode === barcode)) return prev; // déjà en tampon
              return [{ barcode, scannedAt: new Date().toISOString() }, ...prev].slice(0, 50);
            });
            toast.warning(`Code ${barcode} non trouvé — mis de côté dans la zone tampon`);
            setManualBarcode('');
            return;
          }

          const matchedCategory = offData.suggested_category
            ? categories.find(c => c.name.toLowerCase() === offData.suggested_category.toLowerCase())
            : null;

          const fridgeLocation = offData.needs_refrigeration
            ? locations.find(l => /r[ée]frig[ée]rateur|frigo/i.test(l.name))
            : null;

          const offSuggestions = offData.sub_categories_suggestions || [];
          let matchedSubCategoryId = null;
          for (const suggestion of offSuggestions) {
            const found = subcategories.find(s => s.name.toLowerCase() === suggestion.toLowerCase());
            if (found) {
              matchedSubCategoryId = found.id;
              break;
            }
          }

          const newProductData = {
            name: offData.name || `Produit inconnu (${barcode})`,
            brand: offData.brand || '',
            barcode: barcode,
            quantity: 1,
            min_quantity: 1,
            unit: 'unité',
            category_id: matchedCategory?.id || categories[0]?.id || null,
            sub_category_id: matchedSubCategoryId,
            sub_category_name: offSuggestions.length > 0 ? offSuggestions[0] : '',
            location_id: fridgeLocation?.id || locations[0]?.id || 'none',
            image_url: offData.image_url || '',
            description: offData.categories || '',
            nutriscore_grade: offData.nutriscore_grade || null,
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
      }
      return;
    }

    // --- LOGIQUE MODE CLASSIQUE ---
    // Ici on coupe la caméra le temps d'afficher le dialogue de résultat
    // (relancée ensuite par handleCloseDialog / handleSaveNewProduct).
    stopCamera();
    setScannedProduct({ barcode });
    setOpenFoodFactsData(null);
    setExistingProduct(null);
    setSuggestedPrice(null);

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

        setSuggestedPrice(
          offRes.data.suggested_price != null
            ? { value: offRes.data.suggested_price, currency: offRes.data.suggested_price_currency, count: offRes.data.suggested_price_count }
            : null
        );

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
          price: offRes.data.suggested_price != null ? offRes.data.suggested_price : '',
        });
      } catch (error) {
        setFormData({
          name: '', brand: '', barcode: barcode, quantity: 1, min_quantity: 1, unit: 'unité',
          category_id: null, location_id: null, image_url: '', sub_category_id: null, sub_category_name: '', description: '',
          nutriscore_grade: null, price: '',
        });
      }

      setResultDialogOpen(true);
    } catch (error) {
      toast.error('Erreur lors de la recherche');
    } finally {
      setSearching(false);
    }
  }, [searching, scanMode, categories, subcategories, locations, api]);

  // Garde handleBarcodeDetectedRef pointé vers la dernière version à chaque
  // changement de dépendance (notamment scanMode) -- voir le commentaire sur
  // la ref elle-même pour le pourquoi.
  useEffect(() => {
    handleBarcodeDetectedRef.current = handleBarcodeDetected;
  }, [handleBarcodeDetected]);

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

  // Ouvre le dialogue "nouveau produit" pré-rempli avec un code-barres mis
  // de côté dans la zone tampon, pour le compléter manuellement.
  const handleCompleteFromBuffer = (barcode) => {
    setExistingProduct(null);
    setOpenFoodFactsData(null);
    setSuggestedPrice(null);
    setScannedProduct({ barcode });
    setFormData({
      name: '', brand: '', barcode, quantity: 1, min_quantity: 1, unit: 'unité',
      category_id: null, location_id: null, image_url: '', sub_category_id: null, sub_category_name: '', description: '',
      nutriscore_grade: null, price: '',
    });
    setResultDialogOpen(true);
  };

  const handleRemoveFromBuffer = (barcode) => {
    setUnmatchedBuffer((prev) => prev.filter((entry) => entry.barcode !== barcode));
  };

  const handleClearBuffer = () => setUnmatchedBuffer([]);

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
      // Si ce produit venait de la zone tampon (barcode non trouvé sur OFF,
      // complété manuellement), on le retire du tampon.
      if (formData.barcode) {
        setUnmatchedBuffer((prev) => prev.filter((entry) => entry.barcode !== formData.barcode));
      }
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

      {/* Mode de scan : Ajout manuel / Retour de courses / Consommation */}
      <Card className={cn("bg-card border transition-all duration-300", scanMode !== 'add' ? "border-primary/60 bg-primary/5 shadow-md" : "border-border")}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className={cn("p-2.5 rounded-lg", scanMode !== 'add' ? "bg-primary/20 text-primary animate-pulse" : "bg-muted text-muted-foreground")}>
              {scanMode === 'consume' ? <PackageMinus className="w-5 h-5" /> : <ShoppingCart className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm">Mode de scan</h2>
                {scanMode !== 'add' && <Badge className="text-[9px] h-4 uppercase bg-primary">Actif</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {scanMode === 'add' && "Chaque scan ouvre une fiche pour ajouter le produit manuellement."}
                {scanMode === 'shopping' && "Bip sonore, incrémentation automatique (+1) et enregistrement instantané en arrière-plan."}
                {scanMode === 'consume' && "Bip sonore, décrémentation automatique (-1) du produit scanné dans votre stock."}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button
              type="button"
              variant={scanMode === 'add' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setScanMode('add')}
              data-testid="scan-mode-add"
            >
              Ajout manuel
            </Button>
            <Button
              type="button"
              variant={scanMode === 'shopping' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setScanMode('shopping')}
              data-testid="scan-mode-shopping"
            >
              <ShoppingCart className="w-3.5 h-3.5 mr-1.5" /> Retour de courses
            </Button>
            <Button
              type="button"
              variant={scanMode === 'consume' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setScanMode('consume')}
              data-testid="scan-mode-consume"
            >
              <PackageMinus className="w-3.5 h-3.5 mr-1.5" /> Consommation
            </Button>
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
              {cameraActive && (
                <div className="absolute top-2 right-2 flex gap-2 z-10">
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="bg-black/50 hover:bg-black/70 text-white border-none backdrop-blur-sm"
                    onClick={switchCamera}
                    title="Changer de caméra"
                    data-testid="switch-camera-btn"
                  >
                    <SwitchCamera className="w-4 h-4" />
                  </Button>
                  {torchSupported && (
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className={cn(
                        "bg-black/50 hover:bg-black/70 text-white border-none backdrop-blur-sm",
                        torchOn && "bg-amber-500/90 hover:bg-amber-500 text-black"
                      )}
                      onClick={toggleTorch}
                      title={torchOn ? "Éteindre le flash" : "Allumer le flash"}
                      data-testid="toggle-torch-btn"
                    >
                      {torchOn ? <Flashlight className="w-4 h-4" /> : <FlashlightOff className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
              )}
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

      {/* Zone tampon : scans en mode course non trouvés sur Open Food Facts */}
      {unmatchedBuffer.length > 0 && (
        <Card className="bg-card border-amber-500/30" data-testid="unmatched-buffer-card">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="w-5 h-5 text-amber-500" />
              Zone tampon — codes non trouvés
              <Badge variant="outline" className="ml-1">{unmatchedBuffer.length}</Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={handleClearBuffer} data-testid="clear-buffer-btn">
              Vider
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Ces codes-barres scannés en mode course n'ont été trouvés ni dans votre stock, ni sur Open Food Facts.
              Ils n'ont donc pas été ajoutés automatiquement. Complétez-les manuellement ou retirez-les.
            </p>
            <div className="space-y-2">
              {unmatchedBuffer.map((entry) => (
                <div
                  key={entry.barcode}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/30 border border-border"
                  data-testid={`buffer-entry-${entry.barcode}`}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm truncate">{entry.barcode}</p>
                    <p className="text-xs text-muted-foreground">
                      Scanné à {new Date(entry.scannedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCompleteFromBuffer(entry.barcode)}
                      data-testid={`complete-buffer-${entry.barcode}`}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1.5" /> Compléter
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveFromBuffer(entry.barcode)}
                      title="Retirer de la zone tampon"
                      data-testid={`remove-buffer-${entry.barcode}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                <Label>Prix unitaire (€)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 2.50"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                />
                {suggestedPrice && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Prix moyen constaté (Open Prices, {suggestedPrice.count} relevé{suggestedPrice.count > 1 ? 's' : ''}) : {suggestedPrice.value.toFixed(2)} {suggestedPrice.currency}
                  </p>
                )}
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