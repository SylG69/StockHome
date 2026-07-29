import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Users, BarChart3 } from 'lucide-react';
import UsersPage from './UsersPage';
import ApiStatsSection from './ApiStatsSection';

// Sections de la page Administrateur, même pattern que CONFIG_SECTIONS dans
// ConfigurationPage.jsx : pour en ajouter une nouvelle, créer le composant
// puis ajouter une entrée ici -- le sous-menu s'adapte automatiquement.
const ADMIN_SECTIONS = [
  { key: 'users', labelKey: 'page.users', icon: Users, component: UsersPage },
  { key: 'apiStats', labelKey: 'page.apiStats', icon: BarChart3, component: ApiStatsSection },
];

export default function AdminPage() {
  const { t } = useTranslation('admin');
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedSection = searchParams.get('section');
  const initialSection = ADMIN_SECTIONS.some((s) => s.key === requestedSection)
    ? requestedSection
    : ADMIN_SECTIONS[0].key;

  const [activeSection, setActiveSection] = useState(initialSection);

  const handleSelectSection = (key) => {
    setActiveSection(key);
    setSearchParams({ section: key }, { replace: true });
  };

  const ActiveComponent = ADMIN_SECTIONS.find((s) => s.key === activeSection)?.component;

  return (
    <div className="space-y-6" data-testid="admin-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-primary" />
          {t('page.title')}
        </h1>
        <p className="text-muted-foreground mt-1">{t('page.subtitle')}</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible md:w-52 shrink-0 pb-1 md:pb-0">
          {ADMIN_SECTIONS.map((section) => (
            <button
              key={section.key}
              type="button"
              onClick={() => handleSelectSection(section.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-200 ${
                activeSection === section.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
              data-testid={`admin-section-${section.key}`}
            >
              <section.icon className="w-4 h-4" />
              {t(section.labelKey)}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0">
          {ActiveComponent && <ActiveComponent />}
        </div>
      </div>
    </div>
  );
}
