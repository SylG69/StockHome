import { describe, it, expect, vi } from 'vitest'

// i18next-browser-languagedetector lit navigator/localStorage : inutile ici.
vi.mock('i18next-browser-languagedetector', () => ({
  default: { type: 'languageDetector', init() {}, detect: () => 'fr', cacheUserLanguage() {} },
}))

const { resources } = await import('./index.js')

const LANGS = ['fr', 'en', 'es']
const jsonFiles = import.meta.glob('../locales/*/*.json', { eager: true, import: 'default' })
const sources = import.meta.glob(['../**/*.jsx', '../**/*.js', '!../**/*.test.*', '!../locales/**'], {
  eager: true,
  query: '?raw',
  import: 'default',
})

function resolve(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

function keyExists(ns, key) {
  const bundle = resources.fr[ns]
  if (!bundle) return false
  return ['', '_one', '_other', '_zero'].some((suffix) => resolve(bundle, key + suffix) !== undefined)
}

function placeholders(str) {
  return [...str.matchAll(/\{\{\s*([\w.]+)\s*(?:,[^}]*)?\}\}/g)].map((m) => m[1]).sort()
}

function flattenStrings(obj, prefix = '') {
  return Object.entries(obj || {}).flatMap(([k, v]) => {
    const p = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') return flattenStrings(v, p)
    return typeof v === 'string' ? [[p, v]] : []
  })
}

/**
 * Extrait les appels t('clé') statiques d'un fichier source et le(s)
 * namespace(s) associé(s) à chaque alias de `t` (useTranslation(...)).
 */
function extractUsages(source) {
  const aliases = new Map() // alias -> { namespaces:Set, keyPrefix }
  const hookRe = /const\s*\{([^}]*)\}\s*=\s*useTranslation\(\s*([^)]*)\)/g
  for (const [, destructured, args] of source.matchAll(hookRe)) {
    const tMatch = destructured.match(/\bt\b(?:\s*:\s*(\w+))?/)
    if (!tMatch) continue
    const alias = tMatch[1] || 't'
    const nsList = [...args.matchAll(/'([^']+)'/g)].map((m) => m[1])
    const keyPrefix = args.match(/keyPrefix\s*:\s*'([^']+)'/)?.[1]
    const namespaces = keyPrefix ? nsList.filter((n) => n !== keyPrefix) : nsList
    const primary = namespaces.length ? [namespaces[0]] : ['common']
    const entry = aliases.get(alias) || { namespaces: new Set(), keyPrefix }
    primary.forEach((n) => entry.namespaces.add(n))
    aliases.set(alias, entry)
  }
  const usages = []
  for (const [alias, { namespaces, keyPrefix }] of aliases) {
    const callRe = new RegExp(`(?<![\\w.])${alias}\\(\\s*(['"])([^'"\`$]+)\\1`, 'g')
    for (const [, , rawKey] of source.matchAll(callRe)) {
      let key = keyPrefix ? `${keyPrefix}.${rawKey}` : rawKey
      let nsCandidates = [...namespaces]
      const explicit = rawKey.match(/^(\w+):(.+)$/)
      if (explicit) {
        nsCandidates = [explicit[1]]
        key = explicit[2]
      }
      usages.push({ key, nsCandidates })
    }
  }
  return usages
}

describe('i18n — enregistrement des namespaces', () => {
  it.each(LANGS)('tous les JSON de locales/%s sont enregistrés dans i18n/index.js', (lang) => {
    const onDisk = Object.keys(jsonFiles)
      .map((p) => p.match(/locales\/(\w+)\/(\w+)\.json$/))
      .filter((m) => m[1] === lang)
      .map((m) => m[2])
      .sort()
    expect(Object.keys(resources[lang] || {}).sort()).toEqual(onDisk)
  })

  it.each(LANGS)('chaque namespace enregistré pour %s est bien le JSON correspondant', (lang) => {
    for (const ns of Object.keys(resources[lang])) {
      expect(resources[lang][ns], `${lang}/${ns}`).toBe(jsonFiles[`../locales/${lang}/${ns}.json`])
    }
  })
})

describe('i18n — variables d\'interpolation identiques dans les 3 langues', () => {
  const namespaces = Object.keys(resources.fr)
  it.each(namespaces)('namespace %s', (ns) => {
    const mismatches = []
    for (const [key, frValue] of flattenStrings(resources.fr[ns])) {
      const expected = placeholders(frValue)
      for (const lang of ['en', 'es']) {
        const other = resolve(resources[lang][ns], key)
        if (typeof other !== 'string') continue // parité des clés vérifiée par locales.test.js
        const got = placeholders(other)
        if (JSON.stringify(got) !== JSON.stringify(expected)) {
          mismatches.push(`${lang}:${ns}.${key} attend {{${expected}}} obtient {{${got}}}`)
        }
      }
    }
    expect(mismatches).toEqual([])
  })
})

describe('i18n — clés utilisées dans le code', () => {
  const files = Object.entries(sources).filter(([, src]) => src.includes('useTranslation('))
  it('au moins une page est analysée', () => {
    expect(files.length).toBeGreaterThan(10)
  })
  it.each(files.map(([path]) => path))('%s : toutes les clés t(\'...\') statiques existent en fr', (path) => {
    const missing = extractUsages(sources[path])
      .filter(({ key, nsCandidates }) => !nsCandidates.some((ns) => keyExists(ns, key)))
      .map(({ key, nsCandidates }) => `${nsCandidates.join('|')}:${key}`)
    expect([...new Set(missing)]).toEqual([])
  })
})

describe('i18n — auto-vérification de l\'extracteur', () => {
  it('détecte les clés, alias, namespaces explicites et keyPrefix', () => {
    const fake = `
      const { t } = useTranslation(['loans', 'common']);
      const { t: tHousehold } = useTranslation('household', { keyPrefix: 'switcher' });
      t('title'); t("common:actions.cancel"); t(\`dyn.\${x}\`); tHousehold('label'); t('cle.inexistante')
    `
    const usages = extractUsages(fake)
    expect(usages).toEqual([
      { key: 'title', nsCandidates: ['loans'] },
      { key: 'actions.cancel', nsCandidates: ['common'] },
      { key: 'cle.inexistante', nsCandidates: ['loans'] },
      { key: 'switcher.label', nsCandidates: ['household'] },
    ])
    expect(keyExists('loans', 'cle.inexistante')).toBe(false)
  })

  it('compte un nombre significatif de clés analysées', () => {
    const total = Object.values(sources).reduce((n, src) => n + extractUsages(src).length, 0)
    expect(total).toBeGreaterThan(300)
  })
})
