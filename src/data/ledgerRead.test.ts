import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { loginErrorMessage } from './authMessages'
import { fetchSnapshot, isAuthFailure, mapAnchor, mapMovement, ROW_CAP, sinceInstant } from './ledgerRead'

const TZ = 'America/Lima'

const goodMovement = {
  occurred_at: '2026-11-17T15:00:00+00:00',
  direction: 'out',
  amount_cents: 850,
  currency: 'PEN',
  kind: 'card_purchase',
  counterparty: 'TIENDA DE PRUEBA',
}

describe('row mapping (fail closed)', () => {
  it('maps a valid movement and anchor to camelCase', () => {
    expect(mapMovement(goodMovement)).toEqual({
      occurredAt: '2026-11-17T15:00:00+00:00',
      direction: 'out',
      amountCents: 850,
      currency: 'PEN',
      kind: 'card_purchase',
      counterparty: 'TIENDA DE PRUEBA',
    })
    expect(mapAnchor({ id: 3, at: '2026-11-10T12:00:00+00:00', amount_cents: 10_000, currency: 'PEN' })).toEqual({
      id: 3,
      at: '2026-11-10T12:00:00+00:00',
      amountCents: 10_000,
      currency: 'PEN',
    })
  })

  it('rejects rows that cannot be trusted as money', () => {
    for (const bad of [
      { ...goodMovement, amount_cents: 8.5 },
      { ...goodMovement, amount_cents: '850' },
      { ...goodMovement, amount_cents: 0 },
      { ...goodMovement, direction: 'sideways' },
      { ...goodMovement, currency: 'EUR' },
      { ...goodMovement, occurred_at: 'not a date' },
      { ...goodMovement, kind: null },
    ]) {
      expect(() => mapMovement(bad)).toThrow()
    }
    expect(() => mapAnchor({ id: 1, at: '2026-11-10T12:00:00Z', amount_cents: null, currency: 'PEN' })).toThrow()
  })
})

describe('sinceInstant', () => {
  const anchor = { id: 1, at: '2026-11-10T12:00:00.000Z', amountCents: 1, currency: 'PEN' as const }
  it('is the earlier of the latest PEN anchor and the start of the week', () => {
    // Week of Tue 17 Nov starts Mon 16 Nov 00:00 Lima = 05:00Z; the anchor (10 Nov) is earlier.
    expect(sinceInstant([anchor], '2026-11-17T15:00:00.000Z', TZ)).toBe('2026-11-10T12:00:00.000Z')
    expect(sinceInstant([], '2026-11-17T15:00:00.000Z', TZ)).toBe('2026-11-16T05:00:00.000Z')
    const recent = { ...anchor, at: '2026-11-17T10:00:00.000Z' }
    expect(sinceInstant([recent], '2026-11-17T15:00:00.000Z', TZ)).toBe('2026-11-16T05:00:00.000Z')
  })
})

// A minimal stand-in for the supabase query builder: every chained call returns itself and awaiting resolves.
function fakeClient(tables: Record<string, { data: unknown[] | null; error: unknown }>) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = []
  return {
    calls,
    from(table: string) {
      const builder: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'gte', 'order', 'limit']) {
        builder[op] = (...args: unknown[]) => {
          calls.push({ table, op, args })
          return builder
        }
      }
      builder.then = (resolve: (v: unknown) => unknown) => resolve(tables[table])
      return builder
    },
  }
}

describe('fetchSnapshot', () => {
  const anchors = [{ id: 3, at: '2026-11-10T12:00:00+00:00', amount_cents: 10_000, currency: 'PEN' }]

  it('reads anchors then movements since the earliest needed instant, select-only', async () => {
    const client = fakeClient({ balance_anchors: { data: anchors, error: null }, movements: { data: [goodMovement], error: null } })
    const snap = await fetchSnapshot(client as never, '2026-11-17T15:30:00.000Z', TZ)
    expect(snap.fetchedAt).toBe('2026-11-17T15:30:00.000Z')
    expect(snap.anchors).toHaveLength(1)
    expect(snap.movements).toHaveLength(1)
    const gte = client.calls.find((c) => c.table === 'movements' && c.op === 'gte')
    expect(gte?.args).toEqual(['occurred_at', '2026-11-10T12:00:00.000Z'])
    expect(client.calls.every((c) => ['select', 'eq', 'gte', 'order', 'limit'].includes(c.op))).toBe(true)
  })

  it('refuses a result that hit the row cap instead of showing a partial balance', async () => {
    const full = Array.from({ length: ROW_CAP }, () => goodMovement)
    const client = fakeClient({ balance_anchors: { data: anchors, error: null }, movements: { data: full, error: null } })
    await expect(fetchSnapshot(client as never, '2026-11-17T15:30:00.000Z', TZ)).rejects.toThrow(/row cap/)
  })

  it('propagates server errors and malformed rows', async () => {
    const boom = { code: 'PGRST301', message: 'JWT expired' }
    const failing = fakeClient({ balance_anchors: { data: null, error: boom }, movements: { data: [], error: null } })
    await expect(fetchSnapshot(failing as never, '2026-11-17T15:30:00.000Z', TZ)).rejects.toBe(boom)
    const malformed = fakeClient({
      balance_anchors: { data: anchors, error: null },
      movements: { data: [{ ...goodMovement, amount_cents: 1.5 }], error: null },
    })
    await expect(fetchSnapshot(malformed as never, '2026-11-17T15:30:00.000Z', TZ)).rejects.toThrow(/malformed/)
  })
})

describe('isAuthFailure', () => {
  it('flags expired or rejected sessions, not network or cap problems', () => {
    expect(isAuthFailure({ code: 'PGRST301', message: 'JWT expired' })).toBe(true)
    expect(isAuthFailure({ status: 401 })).toBe(true)
    expect(isAuthFailure({ message: 'JWT expired' })).toBe(true)
    expect(isAuthFailure(new TypeError('Failed to fetch'))).toBe(false)
    expect(isAuthFailure(new Error('row cap reached: result may be incomplete'))).toBe(false)
    expect(isAuthFailure(null)).toBe(false)
  })
})

describe('loginErrorMessage (Spanish, never raw server text)', () => {
  it('maps the failures the owner can actually hit', () => {
    expect(loginErrorMessage(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'))).toBe('Correo o contraseña incorrectos.')
    expect(loginErrorMessage(new AuthApiError('rate', 429, 'over_request_rate_limit'))).toMatch(/Demasiados intentos/)
    expect(loginErrorMessage(new AuthRetryableFetchError('network', 0))).toMatch(/Sin conexión/)
    expect(loginErrorMessage(new TypeError('Failed to fetch'))).toMatch(/Sin conexión/)
    expect(loginErrorMessage(new Error('boom'))).toBe('No se pudo iniciar sesión. Intenta otra vez.')
  })
})
