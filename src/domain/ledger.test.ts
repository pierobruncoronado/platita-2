import { describe, expect, it } from 'vitest'
import { balancePenCents, dayRange, flowOf, latestPenAnchor, weekRange, type BalanceAnchor, type LedgerMovement } from './ledger'

const TZ = 'America/Lima' // UTC−5, no DST

function mv(direction: 'in' | 'out', amountCents: number, occurredAt: string, extra: Partial<LedgerMovement> = {}): LedgerMovement {
  return { direction, amountCents, occurredAt, currency: 'PEN', kind: direction === 'in' ? 'deposit' : 'card_purchase', ...extra }
}

const ANCHOR: BalanceAnchor = { id: 1, at: '2026-11-10T12:00:00.000Z', amountCents: 10_000, currency: 'PEN' }

describe('balancePenCents', () => {
  it('is the anchor plus later PEN movements (in +, out −)', () => {
    const movements = [
      mv('in', 2_000, '2026-11-10T12:00:01.000Z'),
      mv('out', 500, '2026-11-11T09:00:00.000Z'),
    ]
    expect(balancePenCents([ANCHOR], movements)).toBe(11_500)
  })

  it('ignores movements at or before the anchor and any USD movement', () => {
    const movements = [
      mv('out', 9_999, '2026-11-10T11:59:59.000Z'),
      mv('out', 700, '2026-11-10T12:00:00.000Z'), // same instant: already inside the reading
      mv('out', 2_360, '2026-11-12T10:00:00.000Z', { currency: 'USD' }),
    ]
    expect(balancePenCents([ANCHOR], movements)).toBe(10_000)
  })

  it('uses the latest anchor (ties: higher id) and null without a PEN anchor', () => {
    const newer: BalanceAnchor = { id: 3, at: '2026-11-12T00:00:00.000Z', amountCents: 5_000, currency: 'PEN' }
    const tie: BalanceAnchor = { id: 4, at: '2026-11-12T00:00:00.000Z', amountCents: 6_000, currency: 'PEN' }
    const usd: BalanceAnchor = { id: 9, at: '2026-11-20T00:00:00.000Z', amountCents: 1, currency: 'USD' }
    expect(latestPenAnchor([ANCHOR, newer, tie, usd])?.id).toBe(4)
    expect(balancePenCents([usd], [])).toBeNull()
    expect(balancePenCents([], [])).toBeNull()
  })
})

describe('flowOf', () => {
  const range = { startMs: Date.parse('2026-11-16T05:00:00.000Z'), endMs: Date.parse('2026-11-17T05:00:00.000Z') }

  it('out = outgoing − refunds, in = incoming without refunds, net = in − out; withdrawals count as out', () => {
    const movements = [
      mv('out', 1_000, '2026-11-16T15:00:00.000Z'),
      mv('out', 5_000, '2026-11-16T16:00:00.000Z', { kind: 'atm_withdrawal' }),
      mv('in', 300, '2026-11-16T17:00:00.000Z', { kind: 'refund' }),
      mv('in', 2_500, '2026-11-16T18:00:00.000Z', { kind: 'yape_received' }),
    ]
    expect(flowOf(movements, range, 'PEN')).toEqual({ outCents: 5_700, inCents: 2_500, netCents: -3_200 })
  })

  it('the range is [start, end)', () => {
    const movements = [mv('out', 100, '2026-11-16T05:00:00.000Z'), mv('out', 200, '2026-11-17T05:00:00.000Z')]
    expect(flowOf(movements, range, 'PEN').outCents).toBe(100)
  })

  it('never mixes currencies', () => {
    const movements = [mv('out', 100, '2026-11-16T15:00:00.000Z'), mv('out', 2_360, '2026-11-16T15:00:00.000Z', { currency: 'USD' })]
    expect(flowOf(movements, range, 'PEN').outCents).toBe(100)
    expect(flowOf(movements, range, 'USD').outCents).toBe(2_360)
  })

  it('rejects rows that are not server movements (fail closed)', () => {
    const local = { type: 'expense', amountCents: 1_000, occurredAt: '2026-11-16T15:00:00.000Z' } as unknown as LedgerMovement
    expect(() => flowOf([local], range, 'PEN')).toThrow()
    expect(() => balancePenCents([ANCHOR], [mv('out', 10.5, '2026-11-16T15:00:00.000Z')])).toThrow()
  })
})

describe('periods in the configured zone', () => {
  it('day is local midnight to local midnight; week is Monday to Monday', () => {
    expect(dayRange('2026-11-17T05:10:00.000Z', TZ)).toEqual({
      startMs: Date.parse('2026-11-17T05:00:00.000Z'),
      endMs: Date.parse('2026-11-18T05:00:00.000Z'),
    })
    expect(weekRange('2026-11-17T05:10:00.000Z', TZ)).toEqual({
      startMs: Date.parse('2026-11-16T05:00:00.000Z'),
      endMs: Date.parse('2026-11-23T05:00:00.000Z'),
    })
  })
})
