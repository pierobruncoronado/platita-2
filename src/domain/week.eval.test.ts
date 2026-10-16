// H5 behavior evals in plain language (AC2, AC4). Run on demand: npm run test:evals
import { describe, expect, it } from 'vitest'
import { confirmExpected, expectedStatus, generateExpected, openExpected, type RecurringTemplate } from './expected'
import { balanceAt, closedWeeks } from './flow'
import { expense, OPENING, TZ } from './test-helpers'
import { daySpend, freeTone, sundayProjection, weekSpend } from './week'

// W43: Mon 2026-10-19 … Sun 25. Lima = UTC−5.
const MESADA: RecurringTemplate = {
  id: 'mesada-papa',
  label: 'Mesada papá',
  shortLabel: 'Mesada',
  windowLabel: 'de lun a jue',
  amountCents: 10000,
  cadence: { kind: 'weekly', windowDays: 4 },
  activeFrom: '2026-10-19T05:00:00.000Z',
}
const THU_1730 = '2026-10-22T22:30:00.000Z'

const piero = () => [
  expense(200, '2026-10-19T14:00:00.000Z', { category: 'transporte', subtype: 'Pasaje' }),
  expense(200, '2026-10-20T14:00:00.000Z', { category: 'transporte', subtype: 'Pasaje' }),
  expense(700, '2026-10-20T17:00:00.000Z', { category: 'comida', subtype: 'Snack' }),
  expense(700, '2026-10-21T17:00:00.000Z', { category: 'comida', subtype: 'Snack' }),
  expense(300, '2026-10-22T16:00:00.000Z', { category: 'bebidas' }),
  expense(8700, '2026-10-21T20:00:00.000Z', { category: 'otros', subtype: 'Claude' }), // day-7 Claude charge
]

describe('H5 eval: "¿cuánto me queda libre esta semana y qué pasa el domingo?"', () => {
  it('Thursday: Libre is negative and amber, hormigas leave Claude out, the Sunday number is what Ahorro really gets', () => {
    const ms = piero()
    const balance = balanceAt(ms, THU_1730, TZ, OPENING)
    expect(balance.weeklyNetCents).toBe(-10800) // 21 of hormigas + 87 of Claude, nothing entered yet
    expect(freeTone(balance.weeklyNetCents)).toBe('warn')

    const spend = weekSpend(ms, balance.weekId, TZ, OPENING)
    expect(spend.hormigasCents).toBe(2100)
    expect(spend.claudeCents).toBe(8700)
    const perDay = daySpend(ms, balance.weekId, TZ, OPENING).map((d) => d.hormigasCents)
    expect(perDay).toEqual([200, 900, 700, 300, 0, 0, 0]) // Claude is not in any bar

    const open = openExpected(generateExpected([MESADA], THU_1730, TZ), ms, THU_1730)
    const owed = open.reduce((sum, x) => sum + x.status.remainingCents, 0)
    expect(owed).toBe(10000)
    expect(sundayProjection(balance.weeklyNetCents, owed).projectedCents).toBe(-800)
  })

  it('if the mesada arrives, the projection equals what Sunday 23:59 really adds to Ahorro; if not, the expected money never counts', () => {
    const ms = piero()
    const [item] = generateExpected([MESADA], THU_1730, TZ)

    // Sunday close WITHOUT the mesada: only real movements count.
    const without = closedWeeks(ms, '2026-10-26T05:00:00.000Z', TZ, OPENING).find((c) => c.weekId === '2026-W43')
    expect(without).toMatchObject({ netCents: -10800, savingsAfterCents: 23084 - 10800 })

    // Mesada arrives Friday: the week closes exactly at the projected number.
    const arrives = confirmExpected(item, ms, 10000, '2026-10-23T15:00:00.000Z', TZ, 'mesada-1')
    expect(expectedStatus(item, [...ms, arrives], '2026-10-23T15:00:00.000Z').state).toBe('settled')
    const withMesada = closedWeeks([...ms, arrives], '2026-10-26T05:00:00.000Z', TZ, OPENING).find((c) => c.weekId === '2026-W43')
    expect(withMesada?.netCents).toBe(-800)
  })

  it('green from zero up: a week with no spending shows 0 in green, no guilt', () => {
    expect(freeTone(balanceAt([], THU_1730, TZ, OPENING).weeklyNetCents)).toBe('ok')
  })
})
