import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Heart, Coffee, Gift, Wallet, ExternalLink } from 'lucide-react';
import Github from '../components/icons/GithubIcon';

// Plateformes de dons suggérées. Renseignez `url` une fois vos comptes
// créés sur chacune de ces plateformes -- tant qu'une URL est vide, son
// bouton reste désactivé (pas de lien mort affiché à l'utilisateur).
const DONATION_PLATFORMS = [
  {
    name: 'Ko-fi',
    icon: Coffee,
    color: 'text-sky-500 bg-sky-500/10',
    descriptionKey: 'sponsor.platforms.kofi',
    url: 'https://ko-fi.com/sylg69',
  },
  {
    name: 'Buy Me a Coffee',
    icon: Gift,
    color: 'text-amber-500 bg-amber-500/10',
    descriptionKey: 'sponsor.platforms.buyMeACoffee',
    url: '', // TODO: https://www.buymeacoffee.com/votre-pseudo
  },
  {
    name: 'GitHub Sponsors',
    icon: Github,
    color: 'text-foreground bg-muted',
    descriptionKey: 'sponsor.platforms.githubSponsors',
    url: '', // TODO: https://github.com/sponsors/votre-compte
  },
  {
    name: 'Liberapay',
    icon: Heart,
    color: 'text-yellow-500 bg-yellow-500/10',
    descriptionKey: 'sponsor.platforms.liberapay',
    url: 'https://liberapay.com/SylG69',
  },
  {
    name: 'PayPal',
    icon: Wallet,
    color: 'text-blue-500 bg-blue-500/10',
    descriptionKey: 'sponsor.platforms.paypal',
    url: 'https://paypal.me/Sylg69',
  },
];

export default function SponsorPage() {
  const { t } = useTranslation('static');
  return (
    <div className="space-y-6 max-w-3xl" data-testid="sponsor-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Heart className="w-7 h-7 text-red-500" />
          {t('sponsor.title')}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t('sponsor.intro')}
        </p>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-4 text-sm text-muted-foreground">
          {t('sponsor.supportText')}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{t('sponsor.donateTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {DONATION_PLATFORMS.map((platform) => (
            <div
              key={platform.name}
              className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border bg-secondary/30"
              data-testid={`donation-platform-${platform.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 rounded-lg shrink-0 ${platform.color}`}>
                  <platform.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{platform.name}</p>
                  <p className="text-xs text-muted-foreground">{t(platform.descriptionKey)}</p>
                </div>
              </div>
              {platform.url ? (
                <a href={platform.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  <Button size="sm" className="gap-1.5">
                    {t('sponsor.donateButton')} <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </a>
              ) : (
                <Button size="sm" variant="outline" disabled className="shrink-0" title={t('sponsor.comingSoonTooltip')}>
                  {t('sponsor.comingSoon')}
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        {t('sponsor.footer')}
      </p>
    </div>
  );
}
