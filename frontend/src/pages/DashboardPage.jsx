import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Package,
  AlertTriangle,
  FolderOpen,
  MapPin,
  ShoppingCart,
  ScanLine,
  ArrowRight,
  TrendingDown,
  Tag,
  Apple,
  BarChart3,
  Euro,
  CalendarClock,
} from 'lucide-react';

export default function DashboardPage() {
  const { api, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  // Statistiques Nutri-Score (produits alimentaires uniquement), chargées
  // séparément du reste du dashboard.
  const [nutriscoreStats, setNutriscoreStats] = useState(null);
  const [nutriscoreLoading, setNutriscoreLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchNutriscoreStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/dashboard/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchNutriscoreStats = async () => {
    try {
      const response = await api.get('/products/nutriscore-stats');
      setNutriscoreStats(response.data);
    } catch (error) {
      console.error('Failed to fetch nutriscore stats:', error);
    } finally {
      setNutriscoreLoading(false);
    }
  };

  // Styles Nutri-Score, cohérents avec ProductsPage.jsx / ProductDetailPage.jsx
  const NUTRISCORE_BAR_COLOR = {
    a: 'bg-emerald-500',
    b: 'bg-lime-500',
    c: 'bg-amber-400',
    d: 'bg-orange-500',
    e: 'bg-destructive',
    unknown: 'bg-muted-foreground/30',
  };
  const NUTRISCORE_BADGE_STYLE = {
    a: 'bg-emerald-500 text-white',
    b: 'bg-lime-500 text-white',
    c: 'bg-amber-400 text-black',
    d: 'bg-orange-500 text-white',
    e: 'bg-destructive text-white',
  };
  const NUTRISCORE_LABEL = { a: 'A', b: 'B', c: 'C', d: 'D', e: 'E', unknown: '?' };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Sous-catégories en stock bas (mêmes IDs que la carte "Sous-catégories en
  // Stock Bas"), utilisé ci-dessous pour colorer les produits de la section
  // "Produits Récents" de façon cohérente -- un produit isolé n'a plus de
  // seuil qui lui est propre, seul le seuil de sa sous-catégorie compte.
  const lowStockSubCategoryIds = new Set((stats?.low_stock_subcategories || []).map(s => s.id));

  const statCards = [
    {
      title: 'Total Produits',
      value: stats?.total_products || 0,
      icon: Package,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      to: '/products',
    },
    {
      title: 'Stock Bas',
      value: stats?.low_stock_count || 0,
      icon: AlertTriangle,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
      alert: stats?.low_stock_count > 0,
      to: '/products?low_stock=true',
    },
    {
      title: 'Catégories',
      value: stats?.total_categories || 0,
      icon: FolderOpen,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      to: '/configuration?section=categories',
    },
    {
      title: 'Emplacements',
      value: stats?.total_locations || 0,
      icon: MapPin,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      to: '/configuration?section=locations',
    },
    {
      title: 'Valeur du Stock',
      value: `${(stats?.total_stock_value || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`,
      icon: Euro,
      color: 'text-violet-500',
      bgColor: 'bg-violet-500/10',
      to: '/products',
    },
  ];

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Bonjour, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-muted-foreground mt-1">
            Voici un aperçu de votre stock domestique
          </p>
        </div>
        <div className="flex gap-3">
          <Link to="/scanner">
            <Button className="btn-glow" data-testid="quick-scan-btn">
              <ScanLine className="w-4 h-4 mr-2" />
              Scanner
            </Button>
          </Link>
          <Link to="/shopping-list">
            <Button variant="secondary" data-testid="shopping-list-btn">
              <ShoppingCart className="w-4 h-4 mr-2" />
              Liste ({stats?.shopping_list_count || 0})
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {statCards.map((stat, index) => (
          <Link
            key={stat.title}
            to={stat.to}
            className={`block animate-fade-in stagger-${index + 1}`}
            data-testid={`stat-card-link-${stat.title.toLowerCase().replace(' ', '-')}`}
          >
            <Card
              className="bg-card border-border card-hover h-full"
              data-testid={`stat-card-${stat.title.toLowerCase().replace(' ', '-')}`}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                  {stat.alert && (
                    <Badge variant="destructive" className="animate-pulse">
                      Alerte
                    </Badge>
                  )}
                </div>
                <div className="mt-4">
                  <p className="text-3xl font-bold">{stat.value}</p>
                  <p className="text-sm text-muted-foreground mt-1">{stat.title}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions & Low Stock */}
      {/* Actions Rapides étant masqué, la grille repasse en 1 colonne pour
          que la carte Stock Bas occupe toute la largeur. Repasser en
          lg:grid-cols-2 si Actions Rapides est réactivé -- entre-temps la
          carte "Bientôt périmés" occupe la seconde colonne. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Actions Rapides -- masqué temporairement à la demande, code
            conservé pour réactivation future si besoin. */}
        {/*
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Actions Rapides</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link to="/products" className="block">
              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors duration-200 cursor-pointer">
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-primary" />
                  <span className="font-medium">Gérer les produits</span>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </Link>
            <Link to="/shopping-list" className="block">
              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors duration-200 cursor-pointer">
                <div className="flex items-center gap-3">
                  <ShoppingCart className="w-5 h-5 text-emerald-500" />
                  <span className="font-medium">Voir la liste de courses</span>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </Link>
            <Link to="/scanner" className="block">
              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors duration-200 cursor-pointer">
                <div className="flex items-center gap-3">
                  <ScanLine className="w-5 h-5 text-amber-500" />
                  <span className="font-medium">Scanner un produit</span>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </Link>
          </CardContent>
        </Card>
        */}

        {/* Low Stock Sub-categories */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-destructive" />
              Sous-catégories en Stock Bas
            </CardTitle>
            {stats?.low_stock_count > 0 && (
              <Badge variant="destructive">{stats.low_stock_count}</Badge>
            )}
          </CardHeader>
          <CardContent>
            {stats?.low_stock_subcategories?.length > 0 ? (
              <div className="space-y-3">
                {stats.low_stock_subcategories.slice(0, 5).map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/20"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                        <Tag className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="font-medium text-sm">{sub.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-destructive">
                        {sub.total_stock} / {sub.threshold}
                      </p>
                    </div>
                  </div>
                ))}
                <Link to="/products?low_stock=true">
                  <Button variant="outline" className="w-full mt-2" data-testid="view-all-low-stock">
                    Voir tous les produits en stock bas
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                  <Package className="w-8 h-8 text-emerald-500" />
                </div>
                <p className="text-muted-foreground">Tous vos produits sont en stock !</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Produits bientôt périmés */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-amber-500" />
              Bientôt Périmés
            </CardTitle>
            {stats?.expiring_soon_count > 0 && (
              <Badge className="bg-amber-500 text-black">{stats.expiring_soon_count}</Badge>
            )}
          </CardHeader>
          <CardContent>
            {stats?.expiring_soon_products?.length > 0 ? (
              <div className="space-y-3">
                {stats.expiring_soon_products.slice(0, 5).map((product) => {
                  const isExpired = new Date(product.expiration_date) < new Date(new Date().toDateString());
                  return (
                    <Link
                      key={product.id}
                      to={`/products/${encodeURIComponent(product.id)}`}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors duration-200 ${
                        isExpired ? 'bg-destructive/5 border-destructive/20 hover:border-destructive/40' : 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                          <Package className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <p className="font-medium text-sm truncate">{product.name}</p>
                      </div>
                      <p className={`text-sm font-semibold shrink-0 ${isExpired ? 'text-destructive' : 'text-amber-500'}`}>
                        {isExpired ? 'Périmé' : new Date(product.expiration_date).toLocaleDateString('fr-FR')}
                      </p>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                  <CalendarClock className="w-8 h-8 text-emerald-500" />
                </div>
                <p className="text-muted-foreground">Aucun produit bientôt périmé</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Nutri-Score des produits alimentaires */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Répartition par Nutri-Score (graphique cliquable) */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Répartition Nutri-Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nutriscoreLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              </div>
            ) : !nutriscoreStats || nutriscoreStats.total_food_products === 0 ? (
              <div className="text-center py-8">
                <Apple className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Aucun produit alimentaire avec Nutri-Score pour le moment.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-4">
                  Basé sur {nutriscoreStats.total_food_products} produit{nutriscoreStats.total_food_products > 1 ? 's' : ''} alimentaire{nutriscoreStats.total_food_products > 1 ? 's' : ''} — cliquez sur une barre pour voir les produits correspondants.
                </p>
                <div className="flex items-end justify-between gap-2 h-40">
                  {(() => {
                    const maxCount = Math.max(...Object.values(nutriscoreStats.distribution), 1);
                    return ['a', 'b', 'c', 'd', 'e', 'unknown'].map((key) => {
                      const count = nutriscoreStats.distribution[key] || 0;
                      const heightPct = count === 0 ? 4 : Math.max((count / maxCount) * 100, 8);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => navigate(`/products?nutriscore=${key}`)}
                          className="flex-1 flex flex-col items-center justify-end h-full gap-1.5 group"
                          data-testid={`nutriscore-bar-${key}`}
                        >
                          <span className="text-xs font-bold text-muted-foreground group-hover:text-foreground transition-colors">
                            {count}
                          </span>
                          <div
                            className={`w-full rounded-t-md transition-all duration-300 group-hover:opacity-80 ${NUTRISCORE_BAR_COLOR[key]}`}
                            style={{ height: `${heightPct}%` }}
                          />
                          <span className="text-xs font-black uppercase text-muted-foreground group-hover:text-foreground transition-colors">
                            {NUTRISCORE_LABEL[key]}
                          </span>
                        </button>
                      );
                    });
                  })()}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Nutri-Score moyen */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Apple className="w-5 h-5 text-emerald-500" />
              Nutri-Score moyen
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nutriscoreLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              </div>
            ) : !nutriscoreStats || !nutriscoreStats.average_grade ? (
              <div className="text-center py-8">
                <Apple className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">
                  Pas encore assez de produits alimentaires avec Nutri-Score pour calculer une moyenne.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <span
                  className={`inline-flex items-center justify-center w-20 h-20 rounded-full text-4xl font-black uppercase shrink-0 ${NUTRISCORE_BADGE_STYLE[nutriscoreStats.average_grade]}`}
                >
                  {nutriscoreStats.average_grade}
                </span>
                <div>
                  <p className="text-2xl font-bold">
                    {nutriscoreStats.average_grade.toUpperCase()}
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      (score {nutriscoreStats.average_score})
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Calculé sur {nutriscoreStats.total_food_products} produit{nutriscoreStats.total_food_products > 1 ? 's' : ''} alimentaire{nutriscoreStats.total_food_products > 1 ? 's' : ''} avec Nutri-Score connu.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Products */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Produits Récents</CardTitle>
          <Link to="/products">
            <Button variant="ghost" size="sm" data-testid="view-all-products">
              Voir tout
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {stats?.recent_products?.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {stats.recent_products.slice(0, 5).map((product) => (
                <div
                  key={product.id}
                  className="p-4 rounded-lg bg-secondary/30 border border-border hover:border-primary/50 transition-colors duration-200"
                >
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-24 rounded-lg object-cover mb-3"
                    />
                  ) : (
                    <div className="w-full h-24 rounded-lg bg-secondary flex items-center justify-center mb-3">
                      <Package className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <p className="font-medium text-sm truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {product.brand || 'Sans marque'}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span
                      className={`text-sm font-semibold ${
                        lowStockSubCategoryIds.has(product.sub_category_id)
                          ? 'text-destructive'
                          : 'text-emerald-500'
                      }`}
                    >
                      {product.quantity} {product.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Aucun produit pour le moment</p>
              <Link to="/products">
                <Button className="mt-4" data-testid="add-first-product">
                  Ajouter un produit
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}