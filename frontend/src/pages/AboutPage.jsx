import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Info,
  Apple,
  Sparkles,
  PawPrint,
  Package,
  ExternalLink,
  Scale,
  Heart,
} from 'lucide-react';

// Les 4 bases Open*Facts utilisées par StockHome (voir product_service.py :
// cascade Alimentaire -> Cosmétique -> Animaux -> Produits divers).
// Icônes reprises de celles utilisées pour les catégories par défaut de
// l'app, pour la cohérence visuelle.
const OFF_SOURCES = [
  {
    name: 'Open Food Facts',
    icon: Apple,
    color: 'text-emerald-500 bg-emerald-500/10',
    description: 'Produits alimentaires : ingrédients, Nutri-Score, repères nutritionnels, allergènes...',
    url: 'https://world.openfoodfacts.org',
  },
  {
    name: 'Open Beauty Facts',
    icon: Sparkles,
    color: 'text-purple-500 bg-purple-500/10',
    description: 'Produits cosmétiques et d\u2019hygiène.',
    url: 'https://world.openbeautyfacts.org',
  },
  {
    name: 'Open Pet Food Facts',
    icon: PawPrint,
    color: 'text-red-500 bg-red-500/10',
    description: 'Alimentation pour animaux de compagnie.',
    url: 'https://world.openpetfoodfacts.org',
  },
  {
    name: 'Open Products Facts',
    icon: Package,
    color: 'text-slate-400 bg-slate-400/10',
    description: 'Base généraliste, utilisée en dernier recours pour les produits non couverts ci-dessus.',
    url: 'https://world.openproductsfacts.org',
  },
];

export default function AboutPage() {
  return (
    <div className="space-y-6 max-w-3xl" data-testid="about-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Info className="w-7 h-7 text-primary" />
          À propos
        </h1>
        <p className="text-muted-foreground mt-1">
          StockHome vous aide à gérer votre stock domestique : produits, catégories, emplacements et liste de courses.
        </p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Sources des données produits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Lorsque vous scannez un code-barres, StockHome interroge automatiquement les bases collaboratives
            et open-source du projet <strong>Open Food Facts</strong>, dans cet ordre, jusqu'à obtenir une réponse :
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {OFF_SOURCES.map((source, index) => (
              <a
                key={source.name}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/60 transition-colors duration-200"
                data-testid={`off-source-${index}`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${source.color}`}>
                  <source.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm flex items-center gap-1">
                    {source.name}
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{source.description}</p>
                </div>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Scale className="w-5 h-5" />
            Licences et attribution
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Conformément aux conditions d'utilisation d'Open Food Facts, nous indiquons que l'ensemble des
            informations produits affichées dans StockHome (nom, marque, catégories, Nutri-Score, photos...)
            provient de ces bases de données collaboratives et open-source.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              La base de données est disponible sous licence{' '}
              <a
                href="https://opendatacommons.org/licenses/odbl/1-0/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Open Database License (ODbL)
              </a>
            </li>
            <li>
              Le contenu individuel des fiches produits est disponible sous{' '}
              <a
                href="https://opendatacommons.org/licenses/dbcl/1-0/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Database Contents License
              </a>
            </li>
            <li>
              Les photos de produits sont disponibles sous licence{' '}
              <a
                href="https://creativecommons.org/licenses/by-sa/3.0/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Creative Commons Attribution ShareAlike
              </a>
            </li>
          </ul>
          <p>
            Plus de détails sur{' '}
            <a
              href="https://world.openfoodfacts.org/terms-of-use"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              la page officielle des conditions d'utilisation
            </a>.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardContent className="p-4 flex items-start gap-3">
          <Heart className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Open Food Facts est un projet associatif à but non lucratif, financé par des dons. Si ces données
            vous sont utiles au quotidien, vous pouvez aussi{' '}
            <a
              href="https://world.openfoodfacts.org/donate-to-open-food-facts"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              soutenir directement Open Food Facts
            </a>.
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        StockHome n'est pas affilié à Open Food Facts ; l'application utilise simplement son API publique.
      </p>
    </div>
  );
}
