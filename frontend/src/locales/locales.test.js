import { describe, it, expect } from 'vitest'

// Vérifie que les 3 langues exposent exactement les mêmes clés, namespace
// par namespace (convention CLAUDE.md : toute clé ajoutée en fr, en ET es).
const files = import.meta.glob('./*/*.json', { eager: true, import: 'default' })

const LANGS = ['fr', 'en', 'es']

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return value && typeof value === 'object' && !Array.isArray(value) ? flatten(value, path) : [path]
  })
}

const byLang = Object.fromEntries(LANGS.map((lang) => [lang, {}]))
for (const [path, content] of Object.entries(files)) {
  const [, lang, file] = path.match(/^\.\/(\w+)\/(\w+)\.json$/)
  if (byLang[lang]) byLang[lang][file] = content
}

const namespaces = [...new Set(LANGS.flatMap((lang) => Object.keys(byLang[lang])))].sort()

describe('locales', () => {
  it('each language has every namespace', () => {
    for (const lang of LANGS) {
      expect(Object.keys(byLang[lang]).sort(), lang).toEqual(namespaces)
    }
  })

  describe.each(namespaces)('namespace %s', (ns) => {
    it.each(['en', 'es'])('fr and %s have the same keys', (lang) => {
      const fr = flatten(byLang.fr[ns] || {})
      const other = flatten(byLang[lang][ns] || {})
      const missing = fr.filter((k) => !other.includes(k))
      const extra = other.filter((k) => !fr.includes(k))
      expect({ missing, extra }).toEqual({ missing: [], extra: [] })
    })

    it('no empty translation in any language', () => {
      for (const lang of LANGS) {
        const empty = []
        const walk = (obj, prefix) => {
          for (const [k, v] of Object.entries(obj || {})) {
            const p = prefix ? `${prefix}.${k}` : k
            if (v && typeof v === 'object') walk(v, p)
            else if (typeof v === 'string' && v.trim() === '') empty.push(p)
          }
        }
        walk(byLang[lang][ns], '')
        expect(empty, `${lang}/${ns}`).toEqual([])
      }
    })
  })
})
