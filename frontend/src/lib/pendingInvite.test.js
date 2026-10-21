import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  setPendingInviteCode,
  getPendingInviteCode,
  clearPendingInviteCode,
  completePendingInvite,
} from './pendingInvite'

beforeEach(() => {
  sessionStorage.clear()
})

describe('pendingInvite', () => {
  it('mémorise puis efface le code', () => {
    setPendingInviteCode('ABCD2345')
    expect(getPendingInviteCode()).toBe('ABCD2345')
    clearPendingInviteCode()
    expect(getPendingInviteCode()).toBeNull()
  })

  it('sans code en attente : aucun appel API, retourne false', async () => {
    const api = { post: vi.fn() }
    await expect(completePendingInvite(api)).resolves.toBe(false)
    expect(api.post).not.toHaveBeenCalled()
  })

  it('rejoint le foyer puis consomme le code (pas de double adhésion)', async () => {
    const api = { post: vi.fn().mockResolvedValue({ data: {} }) }
    setPendingInviteCode('ABCD2345')
    await expect(completePendingInvite(api)).resolves.toBe(true)
    expect(api.post).toHaveBeenCalledWith('/households/join', { invite_code: 'ABCD2345' })
    await expect(completePendingInvite(api)).resolves.toBe(false)
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('erreur API (code invalide / déjà membre) : retourne false et efface le code', async () => {
    const api = { post: vi.fn().mockRejectedValue({ response: { status: 404 } }) }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    setPendingInviteCode('ZZZZZZZZ')
    await expect(completePendingInvite(api)).resolves.toBe(false)
    expect(getPendingInviteCode()).toBeNull()
    spy.mockRestore()
  })
})
