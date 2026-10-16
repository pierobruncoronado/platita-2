/// <reference types="node" />
// Spec §7 flows 2–6, one test each. Run on demand: npm run test:evals
import { describe, expect, it } from 'vitest'
import {
  confirmExpected,
  expectedStatus,
  generateExpected,
  ifExpectedArrives,
  type RecurringTemplate,
} from './expected'
import { balanceAt, closedWeeks } from './flow'
import { weekIdOf } from './time'
import { expense, income, OPENING, OPENING_AT, TZ } from './test-helpers'

describe('eval 2 (AC2): Sunday close adds weekly_net exactly once', () => {
  it('income 130 confirmed, expenses 34 → Savings += 96 at Sun 23:59', () => {
    const ms = [
      income(13000, '2026-10-20T15:00:00.000Z'),
      income(8000, '2026-10-21T15:00:00.000Z', { status: 'expected' }), // never counts
      expense(3400, '2026-10-22T15:00:00.000Z'),
    ]
    const sun2359 = balanceAt(ms, '2026-10-26T04:59:59.999Z', TZ, OPENING)
    expect(sun2359).toMatchObject({ weekId: '2026-W43', savingsAtWeekStartCents: 23084, weeklyNetCents: 9600 })

    const mon0000 = balanceAt(ms, '2026-10-26T05:00:00.000Z', TZ, OPENING)
    expect(mon0000).toMatchObject({ weekId: '2026-W44', savingsAtWeekStartCents: 32684, weeklyNetCents: 0 })

    // Re-opening the app later (reconcile again) never adds the week twice.
    const closes = closedWeeks(ms, '2026-11-10T12:00:00.000Z', TZ, OPENING)
    expect(closes.filter((c) => c.weekId === '2026-W43')).toEqual([
      { weekId: '2026-W43', netCents: 9600, savingsAfterCents: 32684 },
    ])
    expect(closes[closes.length - 1].savingsAfterCents).toBe(32684)
  })
})

describe('eval 3 (AC2, judgment): device timezone change does not move week boundaries', () => {
  it('Sun 23:58 Lima counts in that week, Mon 00:01 Lima in the next, with the device on New York', () => {
    const prevTz = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      expect(new Date('2026-10-26T04:58:00.000Z').getTimezoneOffset()).toBe(240) // device really is NY

      const sun2358 = '2026-10-26T04:58:00.000Z'
      const mon0001 = '2026-10-26T05:01:00.000Z'
      expect(weekIdOf(sun2358, TZ)).toBe('2026-W43')
      expect(weekIdOf(mon0001, TZ)).toBe('2026-W44')

      // A naive device-clock implementation would already see Monday here.
      expect(new Date(sun2358).getDay()).toBe(1)

      const ms = [income(5000, sun2358), income(7000, mon0001)]
      const closes = closedWeeks(ms, '2026-11-02T05:00:00.000Z', TZ, OPENING)
      expect(closes.map((c) => [c.weekId, c.netCents])).toEqual([
        ['2026-W42', 0],
        ['2026-W43', 5000],
        ['2026-W44', 7000],
      ])
    } finally {
      if (prevTz === undefined) delete process.env.TZ
      else process.env.TZ = prevTz
    }
  })
})

const reposicion: RecurringTemplate = {
  id: 'reposicion-claude',
  label: 'Reposición Claude',
  shortLabel: 'Reposición Claude',
  windowLabel: 'test',
  amountCents: 8000,
  cadence: { kind: 'monthly', fromDay: 7, toDay: 14 },
  activeFrom: OPENING_AT,
}

describe('eval 4 (AC3): partial confirmation leaves the rest por cobrar', () => {
  it('Reposición S/80, confirm S/50 → S/50 income, S/30 still expected', () => {
    const now = '2026-11-10T17:00:00.000Z'
    const [item] = generateExpected([reposicion], now, TZ)
    expect(item.id).toBe('reposicion-claude:2026-11')

    const paid = confirmExpected(item, [], 5000, now, TZ, 'inc-1')
    expect(paid).toMatchObject({ type: 'income', status: 'confirmed', amountCents: 5000, occurredAt: now, recurringId: item.id })

    const status = expectedStatus(item, [paid], now)
    expect(status).toEqual({ state: 'pending', confirmedCents: 5000, remainingCents: 3000 })

    // Confirmed part counts in the week's flow; the remainder does not.
    expect(balanceAt([paid], now, TZ, OPENING).weeklyNetCents).toBe(5000)

    // Past the window the remainder turns "atrasada", never dropped.
    expect(expectedStatus(item, [paid], '2026-11-15T05:00:00.000Z').state).toBe('overdue')
  })

  it('rejects zero, negative, fractional or already-settled confirmations', () => {
    const now = '2026-11-10T17:00:00.000Z'
    const [item] = generateExpected([reposicion], now, TZ)
    expect(() => confirmExpected(item, [], 0, now, TZ, 'x')).toThrow()
    expect(() => confirmExpected(item, [], -100, now, TZ, 'x')).toThrow()
    expect(() => confirmExpected(item, [], 50.5, now, TZ, 'x')).toThrow()
    const full = confirmExpected(item, [], 8000, now, TZ, 'full')
    expect(() => confirmExpected(item, [full], 100, now, TZ, 'x')).toThrow(/settled/)
  })
})

describe('eval 5 (AC4): negative week is deducted from Savings', () => {
  it('expenses 87 (Claude) and no income → 230.84 becomes 143.84', () => {
    const ms = [expense(8700, '2026-10-16T14:00:00.000Z', { note: 'Claude' })]
    expect(closedWeeks(ms, '2026-10-19T05:00:00.000Z', TZ, OPENING)).toEqual([
      { weekId: '2026-W42', netCents: -8700, savingsAfterCents: 14384 },
    ])
  })
})

describe('eval 6 (AC5): mesada not confirmed by Thursday → atrasada', () => {
  const mesada: RecurringTemplate = {
    id: 'mesada-papa',
    label: 'Mesada papá',
    shortLabel: 'Mesada papá',
    windowLabel: 'test',
    amountCents: 10000,
    cadence: { kind: 'weekly', windowDays: 4 }, // Mon–Thu
    activeFrom: '2026-10-19T05:00:00.000Z', // from W43
  }

  it('pending on Thursday, atrasada on Friday; counted only in "si llega lo esperado"', () => {
    const thu = '2026-10-22T17:00:00.000Z'
    const fri = '2026-10-23T13:00:00.000Z'
    const [item] = generateExpected([mesada], thu, TZ)
    expect(item.id).toBe('mesada-papa:2026-W43')
    expect(expectedStatus(item, [], thu).state).toBe('pending')
    expect(expectedStatus(item, [], fri).state).toBe('overdue')

    const confirmed = balanceAt([], fri, TZ, OPENING).enCuentaCents
    expect(confirmed).toBe(23084)
    const items = generateExpected([mesada], fri, TZ)
    expect(ifExpectedArrives(confirmed, items, [], fri)).toBe(33084)
  })

  it('an overdue mesada carries into the next week instead of disappearing', () => {
    const nextTue = '2026-10-27T17:00:00.000Z'
    const items = generateExpected([mesada], nextTue, TZ)
    expect(items.map((i) => [i.id, expectedStatus(i, [], nextTue).state])).toEqual([
      ['mesada-papa:2026-W43', 'overdue'],
      ['mesada-papa:2026-W44', 'pending'],
    ])
  })
})
