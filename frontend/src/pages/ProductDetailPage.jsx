import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '../components/ui/label';
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
  ArrowLeft,
  Package,
  MapPin,
  Tag,
  Loader2,
  Info,
  RefreshCw,
  Pencil,
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

// --- Fiche produit façon Open Food Facts (mode "information complète") ---

// Champ texte simple : "Libellé : valeur" (comme "Quantité : 425 g" sur OFF).
function OffField({ label, value }) {
  if (!value) return null;
  return (
    <p className="text-sm">
      <span className="font-semibold">{label} : </span>
      <span className="text-muted-foreground">{value}</span>
    </p>
  );
}

// Champ à valeurs multiples séparées par virgules (catégories, labels...),
// affiché en tags plutôt qu'en texte brut concaténé.
function OffTagsField({ label, value }) {
  if (!value) return null;
  const tags = value.split(',').map((t) => t.trim()).filter(Boolean);
  if (tags.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-semibold mb-1.5">{label} :</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Badge key={tag} variant="outline" className="font-normal">{tag}</Badge>
        ))}
      </div>
    </div>
  );
}

const NOVA_INFO = {
  1: { label: 'Aliments non transformés ou transformés minimalement', color: 'bg-emerald-500' },
  2: { label: 'Ingrédients culinaires transformés', color: 'bg-lime-500' },
  3: { label: 'Aliments transformés', color: 'bg-amber-500' },
  4: { label: 'Aliments ultra-transformés', color: 'bg-destructive' },
};

const ECOSCORE_STYLES = {
  a: 'bg-emerald-500 text-white',
  b: 'bg-lime-500 text-white',
  c: 'bg-amber-400 text-black',
  d: 'bg-orange-500 text-white',
  e: 'bg-destructive text-white',
};

// Les 3 cartes "correspondance" comme en bas de la fiche OFF : Nutri-Score,
// groupe NOVA (ultra-transformation), Green-Score/Eco-Score.
function OffScoreCards({ product }) {
  const nutriscore = (product.nutriscore_grade || '').toLowerCase();
  const nova = product.nova_group;
  const ecoscore = (product.ecoscore_grade || product.environmental_score_grade || '').toLowerCase();

  const cards = [];
  if (nutriscore && NUTRISCORE_STYLES[nutriscore]) {
    cards.push({
      key: 'nutriscore',
      title: `Nutri-Score ${nutriscore.toUpperCase()}`,
      description: NUTRISCORE_TEXT[nutriscore],
      badgeClass: NUTRISCORE_STYLES[nutriscore],
      badgeContent: nutriscore,
    });
  }
  if (nova && NOVA_INFO[nova]) {
    cards.push({
      key: 'nova',
      title: `Groupe NOVA ${nova}`,
      description: NOVA_INFO[nova].label,
      badgeClass: NOVA_INFO[nova].color + ' text-white',
      badgeContent: nova,
    });
  }
  if (ecoscore && ECOSCORE_STYLES[ecoscore]) {
    cards.push({
      key: 'ecoscore',
      title: `Green-Score ${ecoscore.toUpperCase()}`,
      description: 'Impact environnemental estimé',
      badgeClass: ECOSCORE_STYLES[ecoscore],
      badgeContent: ecoscore,
    });
  }

  if (cards.length === 0) return null;

  return (
    <div>
      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
        Correspondance avec vos préférences
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.key} className="p-3 rounded-lg border border-border bg-secondary/30 flex items-start gap-2">
            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-black uppercase shrink-0 ${c.badgeClass}`}>
              {c.badgeContent}
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight">{c.title}</p>
              <p className="text-xs text-muted-foreground">{c.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OffProductSheet({ data, barcode }) {
  const [showRaw, setShowRaw] = useState(false);

  const genericName = data.generic_name_fr || data.generic_name || '';
  const packaging = data.packaging_text_fr || data.packaging_text || data.packaging || '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-6">
        {data.image_url && (
          <img
            src={data.image_url}
            alt={data.product_name || 'Produit'}
            className="w-40 h-40 object-contain rounded-lg border border-border bg-white p-2 mx-auto sm:mx-0 shrink-0"
          />
        )}
        <div className="space-y-2 flex-1 min-w-0">
          {barcode && (
            <p className="text-sm">
              <span className="font-semibold">Code-barres : </span>
              <span className="font-mono text-muted-foreground">{barcode}</span>
            </p>
          )}
          <OffField label="Dénomination générique" value={genericName} />
          <OffField label="Quantité" value={data.quantity} />
          <OffField label="Emballage" value={packaging} />
          <OffField label="Marques" value={data.brands} />
        </div>
      </div>

      <div className="space-y-4">
        <OffTagsField label="Catégories" value={data.categories} />
        <OffTagsField label="Labels, certifications, récompenses" value={data.labels} />
        <OffTagsField label="Allergènes" value={data.allergens} />
      </div>

      <div className="space-y-1">
        <OffField label="Origine des ingrédients" value={data.origins} />
        <OffField label="Lieux de fabrication ou de transformation" value={data.manufacturing_places} />
        <OffField label="Magasins" value={data.stores} />
        <OffField label="Pays de vente" value={data.countries} />
      </div>

      {(data.ingredients_text_fr || data.ingredients_text) && (
        <div>
          <p className="text-sm font-semibold mb-1">Ingrédients :</p>
          <p className="text-sm text-muted-foreground">{data.ingredients_text_fr || data.ingredients_text}</p>
        </div>
      )}

      <OffScoreCards product={data} />

      {/* Accès aux données brutes complètes, repliable, pour les champs non
          repris ci-dessus (exhaustivité sans polluer l'affichage principal). */}
      <div className="pt-2 border-t border-border">
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground underline"
          data-testid="toggle-raw-off-data"
        >
          {showRaw ? 'Masquer' : 'Voir'} toutes les données brutes Open Food Facts
        </button>
        {showRaw && (
          <pre className="text-xs whitespace-pre-wrap break-words bg-secondary/30 rounded p-3 mt-2 max-h-96 overflow-y-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </div>
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

  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(null);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [categoriesRes, subcategoriesRes, locationsRes] = await Promise.all([
          api.get('/categories'),
          api.get('/subcategories'),
          api.get('/locations'),
        ]);
        setCategories(categoriesRes.data);
        setSubcategories(subcategoriesRes.data);
        setLocations(locationsRes.data);
      } catch (error) {
        console.error('Failed to fetch options:', error);
      }
    };
    fetchOptions();
  }, []);

  const handleOpenEdit = () => {
    setFormData({
      name: product.name || '',
      brand: product.brand || '',
      description: product.description || '',
      quantity: product.quantity ?? 0,
      min_quantity: product.min_quantity ?? 1,
      unit: product.unit || 'unité',
      price: product.price ?? '',
      expiration_date: product.expiration_date || '',
      category_id: product.category_id || null,
      sub_category_id: product.sub_category_id || null,
      location_id: product.location_id || null,
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!formData.name.trim()) {
      toast.error('Le nom est requis');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...formData,
        price: formData.price === '' ? null : formData.price,
        expiration_date: formData.expiration_date === '' ? null : formData.expiration_date,
      };
      const response = await api.put(`/products/${encodeURIComponent(id)}`, payload);
      setProduct(response.data);
      toast.success('Produit mis à jour');
      setEditDialogOpen(false);
    } catch (error) {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

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

        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleOpenEdit} data-testid="edit-product-btn">
            <Pencil className="w-4 h-4 mr-2" />
            Modifier
          </Button>
          {product.barcode && (
            <>
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
            </>
          )}
        </div>
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
            {product.price != null && (
              <p className="text-sm font-medium pt-1">Prix unitaire : {Number(product.price).toFixed(2)} €</p>
            )}
            {product.expiration_date && (() => {
              const today = new Date(new Date().toDateString());
              const expiry = new Date(product.expiration_date);
              const isExpired = expiry < today;
              const isSoon = !isExpired && (expiry - today) / 86400000 <= 7;
              return (
                <p className={`text-sm font-medium pt-1 ${isExpired ? 'text-destructive' : isSoon ? 'text-amber-500' : ''}`}>
                  Date de péremption : {expiry.toLocaleDateString('fr-FR')}{isExpired ? ' (périmé)' : ''}
                </p>
              );
            })()}
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
                <OffProductSheet data={offFull.product} barcode={product.barcode} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune donnée Open Food Facts disponible pour ce produit.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog Modifier */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent
          className="bg-card border-border max-w-lg"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader><DialogTitle>Modifier le produit</DialogTitle></DialogHeader>
          {formData && (
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
                <Label>Quantité</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value, 10) || 0 })}
                />
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
              </div>
              <div>
                <Label>Date de péremption</Label>
                <Input
                  type="date"
                  value={formData.expiration_date}
                  onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Catégorie</Label>
                <Select
                  value={formData.category_id || 'none'}
                  onValueChange={(v) => setFormData({ ...formData, category_id: v === 'none' ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sous-catégorie</Label>
                <Select
                  value={formData.sub_category_id || 'none'}
                  onValueChange={(v) => setFormData({ ...formData, sub_category_id: v === 'none' ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune</SelectItem>
                    {subcategories.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Emplacement</Label>
                <Select
                  value={formData.location_id || 'none'}
                  onValueChange={(v) => setFormData({ ...formData, location_id: v === 'none' ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantité minimale</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.min_quantity}
                  onChange={(e) => setFormData({ ...formData, min_quantity: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}