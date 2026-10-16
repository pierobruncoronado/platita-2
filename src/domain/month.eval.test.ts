// H6 behavior evals in plain language. Run on demand: npm run test:evals
import { describe, expect, it } from 'vitest'
import { closedWeeks } from './flow'
import { baselineProgress, monthSummary } from './month'
import { expense, income, OPENING, TZ } from './test-helpers'

const e = (cents: number, at: string, category: string, subtype: string | null = null) => expense(cents, at, { category, subtype })

// Piero's October: opening Thu 15 Oct (W42), then W43 and the start of W44.
const october = () => [
  e(200, '2026-10-16T14:00:00.000Z', 'transporte', 'Pasaje'), // W42
  income(10000, '2026-10-20T16:00:00.000Z'), // W43 mesada
  e(700, '2026-10-21T17:00:00.000Z', 'comida', 'Snack'),
  e(8700, '2026-10-21T20:00:00.000Z', 'otros', 'Claude'),
  e(2500, '2026-10-24T02:00:00.000Z', 'alcohol'), // Fri night Lima (still W43)
]

describe('H6 eval: "¿cuánto me quedó en octubre?"', () => {
  it('Te quedó is exactly what the Sunday closes sent to Ahorro, and Claude shows as its own slice', () => {
    const ms = october()
    const sunday25End = '2026-10-26T04:00:00.000Z' // Sun 25 23:00 Lima: W43 still running
    const s = monthSummary(ms, [], { y: 2026, m: 10 }, sunday25End, TZ, OPENING)
    expect(s.incomeCents).toBe(10000)
    expect(s.spentCents).toBe(200 + 700 + 8700 + 2500)
    expect(s.claudeCents).toBe(8700)
    expect(s.byCategory).toMatchObject({ transporte: 200, comida: 700, alcohol: 2500, otros: 0 })

    // Once both weeks have closed, Ahorro grew by exactly "Te quedó".
    const closes = closedWeeks(ms, '2026-10-26T05:00:00.000Z', TZ, OPENING)
    const gained = closes[closes.length - 1].savingsAfterCents - OPENING.balanceCents
    expect(s.teQuedoCents).toBe(gained)
    expect(s.teQuedoCents).toBe(10000 - 12100)
  })

  it('on Wed 28 Oct the week in progress is visible in October, even though it ends in November', () => {
    const ms = [...october(), e(300, '2026-10-27T16:00:00.000Z', 'bebidas')]
    const s = monthSummary(ms, [], { y: 2026, m: 10 }, '2026-10-28T15:00:00.000Z', TZ, OPENING)
    expect(s.weeks.map((w) => w.weekId)).toContain('2026-W44')
    expect(s.byCategory.bebidas).toBe(300)
  })
})

describe('H6 eval: "¿ya tengo mi línea base?"', () => {
  const weeklyHormigas = [
    e(1400, '2026-10-20T16:00:00.000Z', 'comida'), // W43
    e(2600, '2026-10-27T16:00:00.000Z', 'comida'), // W44
    e(8700, '2026-10-28T16:00:00.000Z', 'otros', 'Claude'), // never a hormiga
    e(2000, '2026-11-03T16:00:00.000Z', 'bebidas'), // W45
    e(2000, '2026-11-10T16:00:00.000Z', 'alcohol'), // W46
  ]

  it('shows progress while measuring, and no average before 4 full weeks (the partial opening week does not count)', () => {
    expect(baselineProgress(weeklyHormigas, '2026-10-26T05:00:00.000Z', TZ, OPENING)).toEqual({ weeksDone: 1, averageHormigasCents: null })
    expect(baselineProgress(weeklyHormigas, '2026-11-09T12:00:00.000Z', TZ, OPENING)).toEqual({ weeksDone: 3, averageHormigasCents: null })
  })

  it('at 4 full weeks gives the weekly hormigas average, Claude excluded, and proposes no cap', () => {
    const b = baselineProgress(weeklyHormigas, '2026-11-16T12:00:00.000Z', TZ, OPENING)
    expect(b).toEqual({ weeksDone: 4, averageHormigasCents: 2000 }) // (1400+2600+2000+2000)/4
    expect(Object.keys(b)).toEqual(['weeksDone', 'averageHormigasCents']) // no goal / cap field exists
  })
})
