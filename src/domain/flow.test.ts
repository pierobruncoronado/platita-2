import { describe, expect, it } from 'vitest'
import { balanceAt, closedWeeks, weeklyNet } from './flow'
import { expense, income, OPENING, TZ } from './test-helpers'

describe('weeklyNet', () => {
  it('excludes undone movements and unconfirmed expected income', () => {
    const ms = [
      expense(700, '2026-10-20T13:00:00.000Z'),
      expense(200, '2026-10-20T14:00:00.000Z', { undone: true }),
      income(10000, '2026-10-20T15:00:00.000Z', { status: 'expected' }),
      income(5000, '2026-10-20T16:00:00.000Z'),
    ]
    expect(weeklyNet(ms, '2026-W43', TZ, OPENING)).toBe(4300)
  })

  it('ignores movements dated before the opening balance (already inside it)', () => {
    const ms = [expense(300, '2026-10-15T15:00:00.000Z'), expense(200, '2026-10-15T20:00:00.000Z')]
    expect(weeklyNet(ms, '2026-W42', TZ, OPENING)).toBe(-200)
  })
})

describe('closedWeeks', () => {
  it('closes nothing while the opening week is still running', () => {
    expect(closedWeeks([], '2026-10-18T12:00:00.000Z', TZ, OPENING)).toEqual([])
  })

  it('catches up several weeks in order after the app was closed', () => {
    const ms = [
      expense(1000, '2026-10-16T15:00:00.000Z'), // W42
      income(3000, '2026-10-21T15:00:00.000Z'), // W43
      expense(500, '2026-10-28T15:00:00.000Z'), // W44
    ]
    expect(closedWeeks(ms, '2026-11-03T12:00:00.000Z', TZ, OPENING)).toEqual([
      { weekId: '2026-W42', netCents: -1000, savingsAfterCents: 22084 },
      { weekId: '2026-W43', netCents: 3000, savingsAfterCents: 25084 },
      { weekId: '2026-W44', netCents: -500, savingsAfterCents: 24584 },
    ])
  })
})

describe('balanceAt', () => {
  it('En cuenta = savings at week start + live weekly_net', () => {
    const ms = [expense(1000, '2026-10-16T15:00:00.000Z'), expense(200, '2026-10-20T13:00:00.000Z')]
    expect(balanceAt(ms, '2026-10-20T14:00:00.000Z', TZ, OPENING)).toEqual({
      weekId: '2026-W43',
      savingsAtWeekStartCents: 22084,
      weeklyNetCents: -200,
      enCuentaCents: 21884,
    })
  })

  it('a Sunday expense logged on Monday (backdated) still reaches Savings', () => {
    const now = '2026-10-26T15:00:00.000Z' // Mon W44, W43 already closed
    const before = balanceAt([], now, TZ, OPENING)
    const backdated = [expense(1000, '2026-10-25T20:00:00.000Z')] // Sun W43
    const after = balanceAt(backdated, now, TZ, OPENING)
    expect(after.savingsAtWeekStartCents).toBe(before.savingsAtWeekStartCents - 1000)
  })

  it('undoing right after midnight restores Savings (no stale close)', () => {
    const now = '2026-10-26T05:00:02.000Z' // Mon 00:00:02 Lima
    const tapped = expense(200, '2026-10-26T04:59:58.000Z') // Sun 23:59:58
    expect(balanceAt([tapped], now, TZ, OPENING).enCuentaCents).toBe(22884)
    expect(balanceAt([{ ...tapped, undone: true }], now, TZ, OPENING).enCuentaCents).toBe(23084)
  })
})
