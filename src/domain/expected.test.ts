import { describe, expect, it } from 'vitest'
import { confirmExpected, expectedStatus, generateExpected, type RecurringTemplate } from './expected'
import { OPENING_AT, TZ } from './test-helpers'

describe('generateExpected', () => {
  it('biweekly abuelo appears every 2 weeks from its anchor week', () => {
    const abuelo: RecurringTemplate = {
      id: 'abuelo',
      label: 'Abuelo',
      shortLabel: 'Abuelo',
      windowLabel: 'test',
      amountCents: 8000,
      cadence: { kind: 'biweekly', anchorWeekId: '2026-W43', windowDays: 7 },
      activeFrom: OPENING_AT,
    }
    const ids = generateExpected([abuelo], '2026-11-20T12:00:00.000Z', TZ).map((i) => i.id)
    expect(ids).toEqual(['abuelo:2026-W43', 'abuelo:2026-W45', 'abuelo:2026-W47'])
  })

  it('is idempotent: same inputs give the same stable ids', () => {
    const t: RecurringTemplate = {
      id: 'mesada-papa',
      label: 'Mesada papá',
      shortLabel: 'Mesada papá',
      windowLabel: 'test',
      amountCents: 10000,
      cadence: { kind: 'weekly', windowDays: 4 },
      activeFrom: OPENING_AT,
    }
    const now = '2026-10-21T12:00:00.000Z'
    expect(generateExpected([t], now, TZ)).toEqual(generateExpected([t], now, TZ))
    // Opening is Thu 14:31, before the W42 Mon–Thu window closes, so W42 is generated too.
    expect(generateExpected([t], now, TZ).map((i) => i.id)).toEqual(['mesada-papa:2026-W42', 'mesada-papa:2026-W43'])
  })

  it('monthly window must be within days 1–28 (fail closed)', () => {
    const bad: RecurringTemplate = {
      id: 'bad',
      label: 'bad',
      shortLabel: 'bad',
      windowLabel: 'test',
      amountCents: 100,
      cadence: { kind: 'monthly', fromDay: 14, toDay: 7 },
      activeFrom: OPENING_AT,
    }
    expect(() => generateExpected([bad], '2026-11-10T12:00:00.000Z', TZ)).toThrow()
  })

  it('weekly windowDays must be an integer 1–7 (fail closed)', () => {
    for (const windowDays of [0, -1, 2.5, 8, NaN]) {
      const t: RecurringTemplate = {
        id: 'w',
        label: 'w',
        shortLabel: 'w',
        windowLabel: 'test',
        amountCents: 100,
        cadence: { kind: 'weekly', windowDays },
        activeFrom: OPENING_AT,
      }
      expect(() => generateExpected([t], '2026-10-21T12:00:00.000Z', TZ)).toThrow()
    }
  })
})

describe('expectedStatus', () => {
  it('an undone confirmation puts the amount back to por cobrar', () => {
    const t: RecurringTemplate = {
      id: 'reposicion-claude',
      label: 'Reposición Claude',
      shortLabel: 'Reposición Claude',
      windowLabel: 'test',
      amountCents: 8000,
      cadence: { kind: 'monthly', fromDay: 7, toDay: 14 },
      activeFrom: OPENING_AT,
    }
    const now = '2026-11-08T12:00:00.000Z'
    const [item] = generateExpected([t], now, TZ)
    const paid = { ...confirmExpected(item, [], 8000, now, TZ, 'p'), undone: true }
    expect(expectedStatus(item, [paid], now)).toEqual({ state: 'pending', confirmedCents: 0, remainingCents: 8000 })
  })
})
