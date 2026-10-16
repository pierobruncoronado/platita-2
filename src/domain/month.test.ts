import { describe, expect, it } from 'vitest'
import type { ExpectedItem, ExpectedStatus } from './expected'
import { baselineProgress, monthSummary, monthWeekIds } from './month'
import { expense, income, OPENING, TZ } from './test-helpers'

const e = (cents: number, at: string, category: string, subtype: string | null = null, extra = {}) =>
  expense(cents, at, { category, subtype, ...extra })

describe('monthWeekIds', () => {
  it('lists the weeks whose Sunday falls in the month (October 2026 starts with the 28 sep week)', () => {
    // Sundays of Oct 2026: 4, 11, 18, 25 → W40 (28 sep), W41, W42, W43
    expect(monthWeekIds({ y: 2026, m: 10 })).toEqual(['2026-W40', '2026-W41', '2026-W42', '2026-W43'])
  })

  it('handles a month starting on a Sunday and year-end week ids', () => {
    expect(monthWeekIds({ y: 2026, m: 2 })).toEqual(['2026-W05', '2026-W06', '2026-W07', '2026-W08']) // Sundays 1, 8, 15, 22
    expect(monthWeekIds({ y: 2026, m: 12 })).toEqual(['2026-W49', '2026-W50', '2026-W51', '2026-W52']) // Sundays 6, 13, 20, 27
    // 2026 has 53 ISO weeks: W53 (28 dec–3 jan) belongs to January 2027 by its Sunday
    expect(monthWeekIds({ y: 2027, m: 1 })).toEqual(['2026-W53', '2027-W01', '2027-W02', '2027-W03', '2027-W04'])
  })
})

describe('monthSummary', () => {
  const NOW = '2026-10-29T15:00:00.000Z' // Thu 29 Oct, W44 (Sunday 1 Nov → November)
  const open: { item: ExpectedItem; status: ExpectedStatus }[] = []

  it('adds the weekly_net of each week (Te quedó) and splits Claude from the categories', () => {
    const ms = [
      income(10000, '2026-10-20T15:00:00.000Z'), // W43
      e(700, '2026-10-20T16:00:00.000Z', 'comida'),
      e(8700, '2026-10-21T16:00:00.000Z', 'otros', 'Claude'), // W43
      e(300, '2026-10-16T16:00:00.000Z', 'bebidas'), // W42 (after opening)
      e(500, '2026-10-26T16:00:00.000Z', 'alcohol'), // W44, in progress
    ]
    const s = monthSummary(ms, open, { y: 2026, m: 10 }, NOW, TZ, OPENING)
    // W40/W41 end before the opening; W44 (Sun 1 Nov) is the week in progress → shown partial
    expect(s.weeks.map((w) => w.weekId)).toEqual(['2026-W42', '2026-W43', '2026-W44'])
    expect(s.incomeCents).toBe(10000)
    expect(s.spentCents).toBe(300 + 700 + 8700 + 500)
    expect(s.teQuedoCents).toBe(10000 - 10200)
    expect(s.claudeCents).toBe(8700)
    expect(s.byCategory).toMatchObject({ comida: 700, bebidas: 300, alcohol: 500, otros: 0 })
  })

  it('never counts a week twice: before it starts it is absent, and on Mon 2 Nov it belongs to November', () => {
    const ms = [e(500, '2026-10-27T16:00:00.000Z', 'alcohol')] // W44, Sunday 1 Nov
    const oct = monthSummary(ms, open, { y: 2026, m: 10 }, '2026-10-24T15:00:00.000Z', TZ, OPENING)
    expect(oct.weeks.map((w) => w.weekId)).toEqual(['2026-W42', '2026-W43']) // W43 in progress, W44 not started
    const nov = monthSummary(ms, open, { y: 2026, m: 11 }, '2026-11-02T15:00:00.000Z', TZ, OPENING)
    expect(nov.weeks.map((w) => w.weekId)).toEqual(['2026-W44', '2026-W45']) // W44 (Sun 1 Nov) + W45 just started
    expect(nov.spentCents).toBe(500)
  })

  it('ignores undone movements, expected income and movements before the opening', () => {
    const ms = [
      e(900, '2026-10-20T16:00:00.000Z', 'comida', null, { undone: true }),
      income(5000, '2026-10-20T16:00:00.000Z', { status: 'expected' }),
      e(900, '2026-10-14T16:00:00.000Z', 'comida'),
    ]
    const s = monthSummary(ms, open, { y: 2026, m: 10 }, NOW, TZ, OPENING)
    expect(s).toMatchObject({ incomeCents: 0, spentCents: 0, teQuedoCents: 0 })
  })

  it('draws everything still owed on the week in progress, even an overdue item from an older window', () => {
    const item = { windowStart: '2026-10-19T05:00:00.000Z' } as ExpectedItem
    const s = monthSummary([], [{ item, status: { state: 'overdue', confirmedCents: 0, remainingCents: 10000 } }], { y: 2026, m: 10 }, NOW, TZ, OPENING)
    expect(s.weeks.find((w) => w.weekId === '2026-W44')?.expectedCents).toBe(10000)
    expect(s.weeks.find((w) => w.weekId === '2026-W43')?.expectedCents).toBe(0)
  })
})

describe('baselineProgress', () => {
  it('does not count the partial opening week', () => {
    // W42 (opening week) closed on Mon 19 Oct → still 0 full weeks
    expect(baselineProgress([], '2026-10-19T12:00:00.000Z', TZ, OPENING)).toEqual({ weeksDone: 0, averageHormigasCents: null })
  })

  it('counts full closed weeks and gives the hormigas average at 4 (Claude excluded)', () => {
    const ms = [
      e(1000, '2026-10-20T16:00:00.000Z', 'comida'), // W43
      e(2000, '2026-10-27T16:00:00.000Z', 'comida'), // W44
      e(8700, '2026-10-28T16:00:00.000Z', 'otros', 'Claude'), // not a hormiga
      e(3000, '2026-11-03T16:00:00.000Z', 'bebidas'), // W45
      e(2000, '2026-11-10T16:00:00.000Z', 'bebidas'), // W46
    ]
    // after Sun 8 Nov (W45 closed) → 3 full weeks (W43, W44, W45)
    expect(baselineProgress(ms, '2026-11-09T12:00:00.000Z', TZ, OPENING)).toEqual({ weeksDone: 3, averageHormigasCents: null })
    // after Sun 15 Nov → W43..W46 = 4 weeks: (1000+2000+3000+2000)/4
    expect(baselineProgress(ms, '2026-11-16T12:00:00.000Z', TZ, OPENING)).toEqual({ weeksDone: 4, averageHormigasCents: 2000 })
  })
})
