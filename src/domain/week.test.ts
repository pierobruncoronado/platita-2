import { describe, expect, it } from 'vitest'
import { expense, income, OPENING, TZ } from './test-helpers'
import { daySpend, freeTone, sundayProjection, weekIncomeCents, weekSpend, weekdayIndex } from './week'

// W43 = Mon 2026-10-19 … Sun 2026-10-25 (Lima = UTC−5)
const MON = '2026-10-19T15:00:00.000Z'
const TUE = '2026-10-20T15:00:00.000Z'
const SUN_LATE = '2026-10-26T04:30:00.000Z' // Sun 23:30 Lima
const NEXT_MON_EARLY = '2026-10-26T05:10:00.000Z' // Mon 00:10 Lima → W44

const e = (cents: number, at: string, category: string, subtype: string | null = null, extra = {}) =>
  expense(cents, at, { category, subtype, ...extra })

describe('weekSpend', () => {
  it('splits hormigas by category and keeps Claude apart', () => {
    const ms = [
      e(200, MON, 'transporte', 'Pasaje'),
      e(700, MON, 'comida', 'Snack'),
      e(8700, TUE, 'otros', 'Claude'),
      e(500, TUE, 'otros'),
    ]
    const s = weekSpend(ms, '2026-W43', TZ, OPENING)
    expect(s.byCategory).toEqual({ transporte: 200, comida: 700, bebidas: 0, alcohol: 0, otros: 500 })
    expect(s.hormigasCents).toBe(1400)
    expect(s.claudeCents).toBe(8700)
  })

  it('ignores undone, expected, income, pre-opening and other weeks', () => {
    const ms = [
      e(300, MON, 'bebidas', null, { undone: true }),
      e(300, MON, 'bebidas', null, { status: 'expected' }),
      income(5000, MON),
      e(300, '2026-10-15T15:00:00.000Z', 'bebidas'), // before opening
      e(300, NEXT_MON_EARLY, 'bebidas'), // W44
      e(100, SUN_LATE, 'bebidas'), // still W43
    ]
    const s = weekSpend(ms, '2026-W43', TZ, OPENING)
    expect(s.hormigasCents).toBe(100)
    expect(s.byCategory.bebidas).toBe(100)
  })

  it('shows an unknown category as Otros so no money disappears', () => {
    const s = weekSpend([e(400, MON, 'Otros')], '2026-W43', TZ, OPENING)
    expect(s.byCategory.otros).toBe(400)
  })
})

describe('weekIncomeCents', () => {
  it('counts only confirmed, not-undone income dated in the week', () => {
    const ms = [
      income(10000, MON),
      income(5000, TUE, { status: 'expected' }),
      income(3000, TUE, { undone: true }),
      income(2000, NEXT_MON_EARLY),
      e(700, MON, 'comida'),
    ]
    expect(weekIncomeCents(ms, '2026-W43', TZ, OPENING)).toBe(10000)
  })
})

describe('daySpend', () => {
  it('stacks by category per weekday Monday → Sunday in the configured zone', () => {
    const ms = [e(200, MON, 'transporte'), e(700, MON, 'comida'), e(300, TUE, 'bebidas'), e(2500, SUN_LATE, 'alcohol'), e(900, TUE, 'otros', 'Claude')]
    const days = daySpend(ms, '2026-W43', TZ, OPENING)
    expect(days.map((d) => d.hormigasCents)).toEqual([900, 300, 0, 0, 0, 0, 2500])
    expect(days[0].byCategory.transporte).toBe(200)
    expect(days[6].byCategory.alcohol).toBe(2500)
  })

  it('sums to the week total', () => {
    const ms = [e(200, MON, 'transporte'), e(700, TUE, 'comida'), e(8700, TUE, 'otros', 'Claude')]
    const total = daySpend(ms, '2026-W43', TZ, OPENING).reduce((a, d) => a + d.hormigasCents, 0)
    expect(total).toBe(weekSpend(ms, '2026-W43', TZ, OPENING).hormigasCents)
  })
})

describe('weekdayIndex', () => {
  it('uses the configured zone, not the device zone', () => {
    // 2026-10-26T04:30Z is Sunday 23:30 in Lima but already Monday in UTC
    expect(weekdayIndex(SUN_LATE, TZ)).toBe(6)
    expect(weekdayIndex(SUN_LATE, 'UTC')).toBe(0)
  })
})

describe('sundayProjection / freeTone', () => {
  it('adds what is owed to the net so far (board: 130 por llegar − 34 = 96)', () => {
    expect(sundayProjection(-3400, 13000).projectedCents).toBe(9600)
  })

  it('can stay negative; amber below zero, green from zero', () => {
    expect(sundayProjection(-3400, 0).projectedCents).toBe(-3400)
    expect(freeTone(-1)).toBe('warn')
    expect(freeTone(0)).toBe('ok')
    expect(freeTone(100)).toBe('ok')
  })
})
