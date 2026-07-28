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

import en_common from '../locales/en/common.json';
import en_auth from '../locales/en/auth.json';
import en_dashboard from '../locales/en/dashboard.json';
import en_products from '../locales/en/products.json';
import en_scanner from '../locales/en/scanner.json';
import en_configuration from '../locales/en/configuration.json';
import en_shoppingList from '../locales/en/shoppingList.json';
import en_household from '../locales/en/household.json';
import en_profile from '../locales/en/profile.json';
import en_users from '../locales/en/users.json';
import en_static from '../locales/en/static.json';

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
  en: {
    common: en_common,
    auth: en_auth,
    dashboard: en_dashboard,
    products: en_products,
    scanner: en_scanner,
    configuration: en_configuration,
    shoppingList: en_shoppingList,
    household: en_household,
    profile: en_profile,
    users: en_users,
    static: en_static,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en'],
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
