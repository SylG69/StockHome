import i18n from '../i18n';

// Locale IETF pour Intl (i18n.language est 'fr', Intl veut 'fr-FR').
const LOCALE_MAP = { fr: 'fr-FR' };

export function getIntlLocale() {
  return LOCALE_MAP[i18n.language] || 'fr-FR';
}

export function formatDate(date, options) {
  return new Date(date).toLocaleDateString(getIntlLocale(), options);
}

export function formatTime(date, options) {
  return new Date(date).toLocaleTimeString(getIntlLocale(), options);
}

export function formatNumber(value, options) {
  return Number(value).toLocaleString(getIntlLocale(), options);
}

export function compareLocale(a, b) {
  return a.localeCompare(b, i18n.language);
}
