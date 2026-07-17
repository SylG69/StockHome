import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Package,
  MapPin,
  Tag,
  Loader2,
  Info,
  RefreshCw,
} from 'lucide-react';

const NUTRISCORE_STYLES = {
  a: 'bg-emerald-500 text-white',
  b: 'bg-lime-500 text-white',
  c: 'bg-amber-400 text-black',
  d: 'bg-orange-500 text-white',
  e: 'bg-destructive text-white',
};

const NUTRISCORE_TEXT = {
  a: 'Très bonne qualité nutritionnelle',
  b: 'Bonne qualité nutritionnelle',
  c: 'Qualité nutritionnelle moyenne',
  d: 'Qualité nutritionnelle plus faible',
  e: 'Moins bonne qualité nutritionnelle',
};

const NUTRIENT_LABEL_FR = {
  fat: 'Matières grasses',
  'saturated-fat': 'Acides gras saturés',
  sugars: 'Sucres',
  salt: 'Sel',
};

const LEVEL_COLOR = {
  low: 'bg-emerald-500',
  moderate: 'bg-amber-400',
  high: 'bg-destructive',
};

function NutriscoreBlock({ grade }) {
  if (!grade || !NUTRISCORE_STYLES[grade]) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="w-4 h-4" /> Nutri-Score non disponible
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-3 p-4 rounded-lg ${NUTRISCORE_STYLES[grade]} bg-opacity-10`}>
      <span className={`inline-flex items-center justify-center w-12 h-12 rounded-full text-xl font-black uppercase shrink-0 ${NUTRISCORE_STYLES[grade]}`}>
        {grade}
      </span>
      <div>
        <p className="font-semibold">Nutri-Score {grade.toUpperCase()}</p>
        <p className="text-sm text-muted-foreground">{NUTRISCORE_TEXT[grade]}</p>
      </div>
    </div>
  );
}

function NutrientLevelsList({ levels }) {
  if (!levels || levels.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Repères nutritionnels</h3>
      {levels.map((n) => (
        <div key={n.key} className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full shrink-0 ${LEVEL_COLOR[n.level] || 'bg-muted'}`} />
          <span className="text-sm flex-1">
            {NUTRIENT_LABEL_FR[n.key] || n.label}
            {n.level === 'high' && ' en quantité élevée'}
            {n.level === 'moderate' && ' en quantité modérée'}
            {n.level === 'low' && ' en faible quantité'}
            {n.value_100g != null && ` (${Math.round(n.value_100g)}%)`}
          </span>
        </div>
      ))}
    </div>
  );
}

// Affiche récursivement un objet JSON brut Open Food Facts de façon lisible,
// pour le mode "information complète" (fiche OFF complète, sans mise en
// forme spécifique -- l'objectif est l'exhaustivité, pas l'esthétique).
function RawOffViewer({ data }) {
  const entries = Object.entries(data || {}).filter(([, v]) => v !== null && v !== '' && v !== undefined);
  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key} className="border-b border-border pb-2">
          <p className="text-xs font-mono text-muted-foreground">{key}</p>
          {typeof value === 'object' ? (
            <pre className="text-xs whitespace-pre-wrap break-words bg-secondary/30 rounded p-2 mt-1">
              {JSON.stringify(value, null, 2)}
            </pre>
          ) : (
            <p className="text-sm break-words">{String(value)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { api } = useAuth();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fullInfo, setFullInfo] = useState(false);

  const [offSimple, setOffSimple] = useState(null);
  const [offFull, setOffFull] = useState(null);
  const [offLoading, setOffLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshFromOff = async () => {
    setRefreshing(true);
    try {
      const response = await api.post(`/products/${encodeURIComponent(id)}/refresh-off`);
      setProduct(response.data);
      // Les données OFF en cache local sont peut-être obsolètes : on les
      // vide pour qu'elles soient rechargées à la prochaine consultation.
      setOffSimple(null);
      setOffFull(null);
      if (response.data.barcode) fetchOffData(response.data.barcode, fullInfo, true);
      toast.success('Données Open Food Facts actualisées');
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Erreur lors de l'actualisation");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProduct();
  }, [id]);

  const fetchProduct = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/products/${encodeURIComponent(id)}`);
      setProduct(response.data);
      if (response.data.barcode) {
        fetchOffData(response.data.barcode, false);
      }
    } catch (error) {
      toast.error('Produit introuvable');
      navigate('/products');
    } finally {
      setLoading(false);
    }
  };

  const fetchOffData = async (barcode, full, force = false) => {
    setOffLoading(true);
    try {
      if (full) {
        if (force || !offFull) {
          const res = await api.get(`/barcode/${barcode}/full`);
          setOffFull(res.data);
        }
      } else {
        if (force || !offSimple) {
          const res = await api.get(`/barcode/${barcode}`);
          setOffSimple(res.data);
        }
      }
    } catch (error) {
      // Produit non trouvé sur Open Food Facts : on affiche simplement les
      // infos StockHome, sans bloquer la page.
    } finally {
      setOffLoading(false);
    }
  };

  const handleToggleFullInfo = (checked) => {
    setFullInfo(checked);
    if (checked && product?.barcode && !offFull) {
      fetchOffData(product.barcode, true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!product) return null;

  return (
    <div className="space-y-6" data-testid="product-detail-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Button variant="ghost" onClick={() => navigate('/products')} data-testid="back-to-products">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour aux produits
        </Button>

        {product.barcode && (
          <div className="flex items-center gap-4 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshFromOff}
              disabled={refreshing}
              data-testid="refresh-off-btn"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Actualiser depuis OFF
            </Button>
            <div className="flex items-center gap-2">
              <Label htmlFor="full-info" className="text-sm">Information complète</Label>
              <Switch id="full-info" checked={fullInfo} onCheckedChange={handleToggleFullInfo} data-testid="toggle-full-info" />
            </div>
          </div>
        )}
      </div>

      {/* En-tête produit : toujours affiché, quel que soit le mode */}
      <Card className="bg-card border-border">
        <CardContent className="p-6 flex flex-col sm:flex-row gap-6">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-32 h-32 rounded-lg object-cover mx-auto sm:mx-0" />
          ) : (
            <div className="w-32 h-32 rounded-lg bg-secondary flex items-center justify-center mx-auto sm:mx-0">
              <Package className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 space-y-2">
            <h1 className="text-2xl font-bold">{product.name}</h1>
            <p className="text-muted-foreground">{product.brand || 'Sans marque'}</p>
            <div className="flex flex-wrap gap-2 pt-2">
              {product.category_name && (
                <Badge variant="secondary" className="gap-1"><Tag className="w-3 h-3" /> {product.category_name}</Badge>
              )}
              {product.sub_category_name && (
                <Badge variant="outline">{product.sub_category_name}</Badge>
              )}
              {product.location_name && (
                <Badge variant="secondary" className="gap-1"><MapPin className="w-3 h-3" /> {product.location_name}</Badge>
              )}
            </div>
            {product.barcode && (
              <p className="text-xs text-muted-foreground font-mono pt-1">Code-barres : {product.barcode}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mode simplifié (par défaut) : photo, nom, marque, catégorie,
          emplacement (déjà ci-dessus) + Nutri-Score et repères nutritionnels. */}
      {!fullInfo && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Santé</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {offLoading && !offSimple ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Récupération des données nutritionnelles...
              </div>
            ) : product.barcode ? (
              <>
                <NutriscoreBlock grade={product.nutriscore_grade || offSimple?.nutriscore_grade} />
                <NutrientLevelsList levels={offSimple?.nutrient_levels} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucun code-barres associé à ce produit : les informations Open Food Facts ne sont pas disponibles.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mode "information complète" : fiche Open Food Facts brute et
          exhaustive, sans filtrage côté StockHome. */}
      {fullInfo && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Fiche Open Food Facts complète</CardTitle>
          </CardHeader>
          <CardContent>
            {offLoading && !offFull ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Chargement de la fiche complète...
              </div>
            ) : offFull?.product ? (
              <>
                <p className="text-xs text-muted-foreground mb-4">Source : {offFull.source}</p>
                <RawOffViewer data={offFull.product} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune donnée Open Food Facts disponible pour ce produit.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
