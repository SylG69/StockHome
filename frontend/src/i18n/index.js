import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import fr_common from '../locales/fr/common.json';
import fr_auth from '../locales/fr/auth.json';
import fr_dashboard from '../locales/fr/dashboard.json';
import fr_products from '../locales/fr/products.json';
import fr_scanner from '../locales/fr/scanner.json';
import fr_configuration from '../locales/fr/configuration.json';
import fr_shoppingList from '../locales/fr/shoppingList.json';
import fr_household from '../locales/fr/household.json';
import fr_profile from '../locales/fr/profile.json';
import fr_users from '../locales/fr/users.json';
import fr_static from '../locales/fr/static.json';

// Ajouter une langue plus tard = ajouter un bloc "resources.xx" ici (imports
// des JSON du dossier locales/xx) + une entrée dans src/i18n/languages.js.
export const resources = {
  fr: {
    common: fr_common,
    auth: fr_auth,
    dashboard: fr_dashboard,
    products: fr_products,
    scanner: fr_scanner,
    configuration: fr_configuration,
    shoppingList: fr_shoppingList,
    household: fr_household,
    profile: fr_profile,
    users: fr_users,
    static: fr_static,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'fr',
    supportedLngs: ['fr'],
    ns: Object.keys(resources.fr),
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'stockhome_language',
    },
    interpolation: {
      escapeValue: false,
    },
    debug: import.meta.env.DEV,
    returnEmptyString: false,
  });

export default i18n;
