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
import fr_chores from '../locales/fr/chores.json';
import fr_loans from '../locales/fr/loans.json';
import fr_household from '../locales/fr/household.json';
import fr_profile from '../locales/fr/profile.json';
import fr_users from '../locales/fr/users.json';
import fr_admin from '../locales/fr/admin.json';
import fr_static from '../locales/fr/static.json';

import en_common from '../locales/en/common.json';
import en_auth from '../locales/en/auth.json';
import en_dashboard from '../locales/en/dashboard.json';
import en_products from '../locales/en/products.json';
import en_scanner from '../locales/en/scanner.json';
import en_configuration from '../locales/en/configuration.json';
import en_shoppingList from '../locales/en/shoppingList.json';
import en_chores from '../locales/en/chores.json';
import en_loans from '../locales/en/loans.json';
import en_household from '../locales/en/household.json';
import en_profile from '../locales/en/profile.json';
import en_users from '../locales/en/users.json';
import en_admin from '../locales/en/admin.json';
import en_static from '../locales/en/static.json';

import es_common from '../locales/es/common.json';
import es_auth from '../locales/es/auth.json';
import es_dashboard from '../locales/es/dashboard.json';
import es_products from '../locales/es/products.json';
import es_scanner from '../locales/es/scanner.json';
import es_configuration from '../locales/es/configuration.json';
import es_shoppingList from '../locales/es/shoppingList.json';
import es_chores from '../locales/es/chores.json';
import es_loans from '../locales/es/loans.json';
import es_household from '../locales/es/household.json';
import es_profile from '../locales/es/profile.json';
import es_users from '../locales/es/users.json';
import es_admin from '../locales/es/admin.json';
import es_static from '../locales/es/static.json';

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
    chores: fr_chores,
    loans: fr_loans,
    household: fr_household,
    profile: fr_profile,
    users: fr_users,
    admin: fr_admin,
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
    chores: en_chores,
    loans: en_loans,
    household: en_household,
    profile: en_profile,
    users: en_users,
    admin: en_admin,
    static: en_static,
  },
  es: {
    common: es_common,
    auth: es_auth,
    dashboard: es_dashboard,
    products: es_products,
    scanner: es_scanner,
    configuration: es_configuration,
    shoppingList: es_shoppingList,
    chores: es_chores,
    loans: es_loans,
    household: es_household,
    profile: es_profile,
    users: es_users,
    admin: es_admin,
    static: es_static,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en', 'es'],
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
