import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings, FolderOpen, MapPin } from 'lucide-react';
import CategoriesConfigSection from './CategoriesConfigSection';
import LocationsConfigSection from './LocationsConfigSection';

// Sections de la page Configuration. Pour en ajouter une nouvelle à
// l'avenir : créer le composant de section (voir CategoriesConfigSection.jsx
// pour un exemple minimal), puis ajouter une entrée ici -- le sous-menu et
// l'affichage s'adaptent automatiquement, rien d'autre à modifier.
const CONFIG_SECTIONS = [
  { key: 'categories', label: 'Catégories', icon: FolderOpen, component: CategoriesConfigSection },
  { key: 'locations', label: 'Emplacements', icon: MapPin, component: LocationsConfigSection },
];

export default function ConfigurationPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedSection = searchParams.get('section');
  const initialSection = CONFIG_SECTIONS.some((s) => s.key === requestedSection)
    ? requestedSection
    : CONFIG_SECTIONS[0].key;

  const [activeSection, setActiveSection] = useState(initialSection);

  const handleSelectSection = (key) => {
    setActiveSection(key);
    setSearchParams({ section: key }, { replace: true });
  };

  const ActiveComponent = CONFIG_SECTIONS.find((s) => s.key === activeSection)?.component;

  return (
    <div className="space-y-6" data-testid="configuration-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="w-7 h-7 text-primary" />
          Configuration
        </h1>
        <p className="text-muted-foreground mt-1">Gérez les paramètres de votre stock domestique</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sous-menu : ligne horizontale scrollable sur mobile, colonne fixe
            à gauche à partir de md (mini layout dans la page). */}
        <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible md:w-52 shrink-0 pb-1 md:pb-0">
          {CONFIG_SECTIONS.map((section) => (
            <button
              key={section.key}
              type="button"
              onClick={() => handleSelectSection(section.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-200 ${
                activeSection === section.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
              data-testid={`config-section-${section.key}`}
            >
              <section.icon className="w-4 h-4" />
              {section.label}
            </button>
          ))}
        </nav>

        {/* Contenu de la section active */}
        <div className="flex-1 min-w-0">
          {ActiveComponent && <ActiveComponent />}
        </div>
      </div>
    </div>
  );
}
