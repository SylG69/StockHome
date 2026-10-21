// Tests du composant LoansPage sans @testing-library (absent des
// devDependencies) : rendu via react-dom/client + act, dépendances externes
// (AuthContext, i18n, sonner, zxing) mockées.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Fuseau de l'utilisateur cible (France) : doit être positionné AVANT tout
// import qui manipule des dates.
vi.hoisted(() => {
  process.env.TZ = 'Europe/Paris'
})

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import loansSource from './LoansPage.jsx?raw'
import frLoans from '../locales/fr/loans.json'
import frCommon from '../locales/fr/common.json'

const api = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
let activeHousehold = { id: 'h1', loan_book_duration_days: 21, loan_game_duration_days: 14 }

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ api, activeHousehold }),
}))
// `t` doit être une référence stable (comme avec le vrai react-i18next) :
// fetchLoans en dépend via useCallback.
vi.mock('react-i18next', () => {
  const translation = { t: (key) => key, i18n: { language: 'fr' } }
  return { useTranslation: () => translation }
})
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))
vi.mock('@zxing/library', () => ({
  BrowserMultiFormatReader: class {
    reset() {}
    decodeFromVideoDevice() { return Promise.resolve() }
  },
  DecodeHintType: { POSSIBLE_FORMATS: 'POSSIBLE_FORMATS' },
  BarcodeFormat: { EAN_13: 1, EAN_8: 2, UPC_A: 3, UPC_E: 4 },
}))
vi.mock('../lib/formatters', () => ({
  formatDate: (d) => new Date(d).toISOString().slice(0, 10),
}))

const { default: LoansPage } = await import('./LoansPage.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
// Polyfills jsdom nécessaires à Radix (Dialog/Select).
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} }
Element.prototype.hasPointerCapture ||= () => false
Element.prototype.scrollIntoView ||= () => {}

let container
let root

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(createElement(LoansPage))
  })
}

function buttonByText(text) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
}

async function flush() {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function click(el) {
  await act(async () => {
    el.click()
  })
  await flush()
}

function dateInputs() {
  return [...document.querySelectorAll('input[type="date"]')].map((i) => i.value)
}

const LOAN = {
  id: 'l1', user_id: 'u1', household_id: 'h1', type: 'book', title: 'Dune', author: 'Herbert',
  publisher: null, cover_url: null, barcode: null, source: null, notes: '',
  borrowed_at: '2026-10-01T00:00:00Z', due_at: '2026-10-22T00:00:00Z', returned_at: null,
  status: 'due_soon', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  api.get.mockReset().mockResolvedValue({ data: [] })
  api.post.mockReset().mockResolvedValue({ data: {} })
  api.put.mockReset().mockResolvedValue({ data: {} })
  api.delete.mockReset().mockResolvedValue({ data: {} })
  activeHousehold = { id: 'h1', loan_book_duration_days: 21, loan_game_duration_days: 14 }
})

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('LoansPage — chargement et liste', () => {
  it('appelle GET /loans au montage et affiche l\'état vide', async () => {
    vi.setSystemTime(new Date('2026-10-21T10:00:00+02:00'))
    await render()
    expect(api.get).toHaveBeenCalledWith('/loans')
    expect(document.body.textContent).toContain('empty')
  })

  it('sépare emprunts en cours et historique, et compte les retards', async () => {
    vi.setSystemTime(new Date('2026-10-21T10:00:00+02:00'))
    api.get.mockResolvedValue({
      data: [
        { ...LOAN, id: 'a', title: 'En retard', status: 'overdue' },
        { ...LOAN, id: 'b', title: 'Bientôt', status: 'due_soon' },
        { ...LOAN, id: 'c', title: 'Rendu', status: 'returned', returned_at: '2026-10-10T00:00:00Z' },
      ],
    })
    await render()
    const text = document.body.textContent
    expect(text).toContain('history.title')
    expect(text).toContain('Rendu')
    // un seul bouton "rendre" par emprunt non rendu
    expect([...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'markReturned')).toHaveLength(2)
  })

  it('un emprunt rendu disparaît de la liste en cours après "markReturned"', async () => {
    vi.setSystemTime(new Date('2026-10-21T10:00:00+02:00'))
    api.get.mockResolvedValue({ data: [LOAN] })
    api.post.mockResolvedValue({ data: { ...LOAN, status: 'returned', returned_at: '2026-10-21T08:00:00Z' } })
    await render()
    await click(buttonByText('markReturned'))
    expect(api.post).toHaveBeenCalledWith('/loans/l1/return')
    expect(buttonByText('markReturned')).toBeUndefined()
    expect(document.body.textContent).toContain('history.title')
  })
})

describe('LoansPage — dates du formulaire (fuseau Europe/Paris)', () => {
  // BUG (LoansPage.jsx:62,69-73) : addDays() part de minuit LOCAL puis toISOString() (UTC) -> en
  // UTC+1/+2 l'échéance proposée a 1 jour de moins que la durée du foyer (20 j au lieu de 21).
  it.fails('ajout manuel : emprunt aujourd\'hui, échéance = +21 jours (livre)', async () => {
    vi.setSystemTime(new Date('2026-10-21T10:00:00+02:00'))
    await render()
    await click(buttonByText('addManual'))
    expect(dateInputs()).toEqual(['2026-10-21', '2026-11-11'])
  })

  // BUG (LoansPage.jsx:62,65-67) : todayInputValue() utilise toISOString() (UTC) -> entre 00:00 et
  // 02:00 heure de Paris, la date d'emprunt proposée est la veille.
  it.fails('juste après minuit heure locale, la date d\'emprunt proposée est bien aujourd\'hui', async () => {
    vi.setSystemTime(new Date('2026-10-21T00:30:00+02:00'))
    await render()
    await click(buttonByText('addManual'))
    expect(dateInputs()[0]).toBe('2026-10-21')
  })

  it('édition : les dates affichées correspondent à celles de l\'emprunt', async () => {
    vi.setSystemTime(new Date('2026-10-21T10:00:00+02:00'))
    // Emprunt créé depuis le front (borrowed_at "2026-10-01T00:00:00" naïf,
    // stocké en UTC par le backend).
    api.get.mockResolvedValue({ data: [LOAN] })
    await render()
    const editButton = [...document.querySelectorAll('button')].find((b) => b.querySelector('svg.lucide-pencil'))
    await click(editButton)
    expect(dateInputs()).toEqual(['2026-10-01', '2026-10-22'])
  })

  // BUG (LoansPage.jsx:62-73) : due_at envoyée avec 1 jour de moins (cf. ajout manuel).
  it.fails('enregistre avec le payload attendu (dates naïves, champs vides -> null)', async () => {
    vi.setSystemTime(new Date('2026-10-21T10:00:00+02:00'))
    await render()
    await click(buttonByText('addManual'))
    const titleInput = document.querySelector('input[placeholder="dialog.titlePlaceholder"]')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(titleInput, 'Fondation')
      titleInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(buttonByText('add'))
    expect(api.post).toHaveBeenCalledTimes(1)
    const [url, payload] = api.post.mock.calls[0]
    expect(url).toBe('/loans')
    expect(payload).toMatchObject({
      type: 'book', title: 'Fondation', author: null, publisher: null, cover_url: null, barcode: null,
      borrowed_at: '2026-10-21T00:00:00',
    })
    expect(payload.due_at).toBe('2026-11-11T00:00:00')
  })

  it('refuse un titre vide sans appeler l\'API', async () => {
    vi.setSystemTime(new Date('2026-10-21T10:00:00+02:00'))
    const { toast } = await import('sonner')
    await render()
    await click(buttonByText('addManual'))
    await click(buttonByText('add'))
    expect(api.post).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('toast.titleRequired')
  })
})

describe('LoansPage — recherche par code-barres', () => {
  // BUG (LoansPage.jsx:179) : code-barres interpolé sans encodeURIComponent dans l'URL de lookup.
  // it.fails : passe tant que le bug est présent ; repasser en it() après correction.
  it.fails('encode le code saisi dans l\'URL de recherche', async () => {
    vi.setSystemTime(new Date('2026-10-21T10:00:00+02:00'))
    api.get.mockImplementation((url) =>
      url === '/loans' ? Promise.resolve({ data: [] }) : Promise.reject(new Error('404'))
    )
    await render()
    const scanBook = [...document.querySelectorAll('button')].find((b) => b.title?.includes('type.book'))
    await click(scanBook)
    const input = document.querySelector('input[placeholder="scan.manual.inputPlaceholder"]')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, '978/2?x=1#a')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    const lookupUrl = api.get.mock.calls.map(([u]) => u).find((u) => u.startsWith('/loans/lookup'))
    expect(lookupUrl).toBe(`/loans/lookup/book/${encodeURIComponent('978/2?x=1#a')}`)
  })
})

describe('LoansPage — clés i18n', () => {
  it('toutes les clés t(...) utilisées existent dans fr/loans.json ou fr/common.json', () => {
    const keys = [...loansSource.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1])
    const dynamic = [...loansSource.matchAll(/\bt\(\s*editingId \? '([^']+)' : '([^']+)'/g)].flatMap((m) => [m[1], m[2]])
    const resolve = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)
    const missing = [...keys, ...dynamic].filter((key) => {
      if (key.startsWith('common:')) return resolve(frCommon, key.slice(7)) === undefined
      return resolve(frLoans, key) === undefined
    })
    for (const status of ['borrowed', 'due_soon', 'overdue', 'returned']) {
      if (resolve(frLoans, `status.${status}`) === undefined) missing.push(`status.${status}`)
    }
    for (const type of ['book', 'videogame']) {
      if (resolve(frLoans, `type.${type}`) === undefined) missing.push(`type.${type}`)
    }
    expect(missing).toEqual([])
  })
})
