// H3 behavior evals in plain language (spec v2: balance + flow). Run on demand: npm run test:evals
// All amounts are synthetic. Lima = UTC−5 (no DST). 2026-11-16 is a Monday (W47).
import { afterEach, describe, expect, it } from 'vitest'
import { homeNumbers, type BalanceAnchor, type LedgerMovement } from './ledger'

const TZ = 'America/Lima'
const ANCHOR: BalanceAnchor = { id: 1, at: '2026-11-10T12:00:00.000Z', amountCents: 10_000, currency: 'PEN' }

function mv(direction: 'in' | 'out', amountCents: number, occurredAt: string, extra: Partial<LedgerMovement> = {}): LedgerMovement {
  return { direction, amountCents, occurredAt, currency: 'PEN', kind: direction === 'in' ? 'yape_received' : 'card_purchase', ...extra }
}

describe('Eval: "¿cuánto tengo y cuánto gasté hoy?"', () => {
  it('shows the anchor plus what moved after it, and today\'s spending', () => {
    // Anchor S/100.00 on Tue 10 Nov. Wed 11: spent S/20 and received S/5. Today Tue 17 Nov 10:00 Lima: spent S/8.50.
    const movements = [
      mv('out', 2_000, '2026-11-11T15:00:00.000Z'),
      mv('in', 500, '2026-11-11T16:00:00.000Z'),
      mv('out', 850, '2026-11-17T15:00:00.000Z'),
    ]
    const n = homeNumbers([ANCHOR], movements, '2026-11-17T15:30:00.000Z', TZ)
    expect(n.balancePenCents).toBe(10_000 - 2_000 + 500 - 850)
    expect(n.todayPen).toEqual({ outCents: 850, inCents: 0, netCents: -850 })
    expect(n.weekPen.outCents).toBe(850) // the Wed 11 spending belongs to the previous week
  })

  it('a payment at 23:30 Lima on Monday is not "today" at 00:10 on Tuesday, but is still this week', () => {
    const movements = [mv('out', 1_000, '2026-11-17T04:30:00.000Z')] // Mon 16 Nov 23:30 Lima
    const n = homeNumbers([ANCHOR], movements, '2026-11-17T05:10:00.000Z', TZ) // Tue 17 Nov 00:10 Lima
    expect(n.todayPen.outCents).toBe(0)
    expect(n.weekPen.outCents).toBe(1_000)
  })

  it('Sunday night belongs to the old week; the new week starts Monday 00:00 Lima', () => {
    const movements = [mv('out', 1_000, '2026-11-16T04:30:00.000Z')] // Sun 15 Nov 23:30 Lima
    const n = homeNumbers([ANCHOR], movements, '2026-11-16T05:10:00.000Z', TZ) // Mon 16 Nov 00:10 Lima
    expect(n.weekId).toBe('2026-W47')
    expect(n.weekPen.outCents).toBe(0)
  })
})

describe('Eval: the device zone never moves the numbers', () => {
  const original = process.env.TZ
  afterEach(() => {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  })

  it('same day and week totals when the phone is in Auckland, New York or UTC', () => {
    const movements = [
      mv('out', 1_000, '2026-11-17T04:30:00.000Z'), // Mon 16 Nov 23:30 Lima
      mv('out', 400, '2026-11-17T05:30:00.000Z'), // Tue 17 Nov 00:30 Lima
      mv('in', 900, '2026-11-17T15:00:00.000Z'),
    ]
    const now = '2026-11-17T15:30:00.000Z'
    const seen = new Set<string>()
    const deviceHours: number[] = []
    for (const device of ['Pacific/Auckland', 'America/New_York', 'UTC']) {
      process.env.TZ = device
      deviceHours.push(new Date(now).getHours())
      seen.add(JSON.stringify(homeNumbers([ANCHOR], movements, now, TZ)))
    }
    // Guard against a vacuous test: the device zone really did change between runs.
    expect(new Set(deviceHours).size).toBe(3)
    expect(seen.size).toBe(1)
    const n = homeNumbers([ANCHOR], movements, now, TZ)
    expect(n.todayPen).toEqual({ outCents: 400, inCents: 900, netCents: 500 })
    expect(n.weekPen.outCents).toBe(1_400)
  })
})

describe('Eval: lo que no es dato del servidor no entra', () => {
  it('a local "Gasto rápido" (v1 shape) is rejected, never added to the balance or to today', () => {
    const tile = { id: 'm1', type: 'expense', amountCents: 1_000, occurredAt: '2026-11-17T15:00:00.000Z', status: 'confirmed' } as unknown as LedgerMovement
    expect(() => homeNumbers([ANCHOR], [tile], '2026-11-17T15:30:00.000Z', TZ)).toThrow()
  })

  it('"Te deben" (expected, not confirmed) has no representation: an expected row is rejected', () => {
    const expected = { id: 'e1', type: 'income', status: 'expected', amountCents: 71_000, occurredAt: '2026-11-17T15:00:00.000Z' } as unknown as LedgerMovement
    expect(() => homeNumbers([ANCHOR], [expected], '2026-11-17T15:30:00.000Z', TZ)).toThrow()
  })
})

describe('Eval: dólares aparte', () => {
  it('a USD charge on the soles account does not change the soles balance or flow, and shows in dollars', () => {
    const movements = [mv('out', 2_360, '2026-11-17T15:00:00.000Z', { currency: 'USD' })]
    const n = homeNumbers([ANCHOR], movements, '2026-11-17T15:30:00.000Z', TZ)
    expect(n.balancePenCents).toBe(10_000)
    expect(n.todayPen.outCents).toBe(0)
    expect(n.todayUsd.outCents).toBe(2_360)
  })
})

describe('Eval: un ancla nuevo reemplaza al anterior', () => {
  it('after Piero reads a new balance, only movements after that reading count', () => {
    const second: BalanceAnchor = { id: 2, at: '2026-11-15T12:00:00.000Z', amountCents: 7_000, currency: 'PEN' }
    const movements = [mv('out', 2_000, '2026-11-11T15:00:00.000Z'), mv('out', 300, '2026-11-16T15:00:00.000Z')]
    const n = homeNumbers([ANCHOR, second], movements, '2026-11-17T15:30:00.000Z', TZ)
    expect(n.balancePenCents).toBe(6_700)
  })
})
