import { useTranslation } from 'react-i18next';
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
  Landmark,
  Library,
  BookMarked,
  Database,
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
    descriptionKey: 'about.sources.openFoodFacts',
    url: 'https://world.openfoodfacts.org',
  },
  {
    name: 'Open Beauty Facts',
    icon: Sparkles,
    color: 'text-purple-500 bg-purple-500/10',
    descriptionKey: 'about.sources.openBeautyFacts',
    url: 'https://world.openbeautyfacts.org',
  },
  {
    name: 'Open Pet Food Facts',
    icon: PawPrint,
    color: 'text-red-500 bg-red-500/10',
    descriptionKey: 'about.sources.openPetFoodFacts',
    url: 'https://world.openpetfoodfacts.org',
  },
  {
    name: 'Open Products Facts',
    icon: Package,
    color: 'text-slate-400 bg-slate-400/10',
    descriptionKey: 'about.sources.openProductsFacts',
    url: 'https://world.openproductsfacts.org',
  },
];

// Sources utilisées par le module Emprunts (voir loan_service.py) : cascade
// BnF -> Open Library -> Google Books pour les livres, Wikidata pour les
// jeux vidéo (pas de RAWG.io, qui n'indexe pas les codes-barres).
const LOAN_SOURCES = [
  {
    name: 'BnF (catalogue SRU)',
    icon: Landmark,
    color: 'text-blue-500 bg-blue-500/10',
    descriptionKey: 'about.loanSources.bnf',
    url: 'https://catalogue.bnf.fr',
  },
  {
    name: 'Open Library',
    icon: Library,
    color: 'text-amber-500 bg-amber-500/10',
    descriptionKey: 'about.loanSources.openLibrary',
    url: 'https://openlibrary.org',
  },
  {
    name: 'Google Books',
    icon: BookMarked,
    color: 'text-red-500 bg-red-500/10',
    descriptionKey: 'about.loanSources.googleBooks',
    url: 'https://books.google.com',
  },
  {
    name: 'Wikidata',
    icon: Database,
    color: 'text-teal-500 bg-teal-500/10',
    descriptionKey: 'about.loanSources.wikidata',
    url: 'https://www.wikidata.org',
  },
];

export default function AboutPage() {
  const { t } = useTranslation('static');
  return (
    <div className="space-y-6 max-w-3xl" data-testid="about-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Info className="w-7 h-7 text-primary" />
          {t('about.title')}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t('about.intro')}
        </p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{t('about.sourcesTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('about.sourcesIntroBefore')} <strong>Open Food Facts</strong>{t('about.sourcesIntroAfter')}
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
                  <p className="text-xs text-muted-foreground mt-0.5">{t(source.descriptionKey)}</p>
                </div>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{t('about.loanSourcesTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('about.loanSourcesIntro')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {LOAN_SOURCES.map((source, index) => (
              <a
                key={source.name}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/60 transition-colors duration-200"
                data-testid={`loan-source-${index}`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${source.color}`}>
                  <source.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm flex items-center gap-1">
                    {source.name}
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t(source.descriptionKey)}</p>
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
            {t('about.licensesTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            {t('about.licensesIntro')}
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              {t('about.licenseDbBefore')}{' '}
              <a
                href="https://opendatacommons.org/licenses/odbl/1-0/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {t('about.licenseDbLink')}
              </a>
            </li>
            <li>
              {t('about.licenseContentBefore')}{' '}
              <a
                href="https://opendatacommons.org/licenses/dbcl/1-0/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {t('about.licenseContentLink')}
              </a>
            </li>
            <li>
              {t('about.licensePhotosBefore')}{' '}
              <a
                href="https://creativecommons.org/licenses/by-sa/3.0/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {t('about.licensePhotosLink')}
              </a>
            </li>
          </ul>
          <p>
            {t('about.moreDetailsBefore')}{' '}
            <a
              href="https://world.openfoodfacts.org/terms-of-use"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {t('about.moreDetailsLink')}
            </a>.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardContent className="p-4 flex items-start gap-3">
          <Heart className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            {t('about.donateBefore')}{' '}
            <a
              href="https://world.openfoodfacts.org/donate-to-open-food-facts"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              {t('about.donateLink')}
            </a>.
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        {t('about.footer')}
      </p>
    </div>
  );
}
