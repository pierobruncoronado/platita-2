// Spec §7 eval 7 (AC6) in plain language. Run on demand: npm run test:evals
import { describe, expect, it } from 'vitest'
import { streakAt } from './streak'
import { TZ } from './test-helpers'

// Lima afternoons of Oct 2026: Mon 19 … Sun 25
const day = (d: number, hh = 17) => `2026-10-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:00:00.000Z`
const k = (d: number) => `2026-10-${String(d).padStart(2, '0')}`

describe('eval 7 (AC6): "me olvidé de cerrar un par de días"', () => {
  const closed = [k(19), k(20)] // Mon and Tue closed

  it('Wed and Thu pass without closing: on Friday morning the streak is still alive with 2', () => {
    expect(streakAt(closed, day(23, 14), TZ)).toMatchObject({ count: 2, alive: true })
  })

  it('closing on Friday continues the same streak (3 closed days)', () => {
    expect(streakAt([...closed, k(23)], day(23, 22), TZ)).toMatchObject({ count: 3, alive: true })
  })

  it('a third day without closing breaks it: Saturday reads 0, no grace days', () => {
    expect(streakAt(closed, day(24, 14), TZ)).toMatchObject({ count: 0, alive: false })
  })

  it('after a break, closing starts a fresh streak at 1 and the level keeps counting all closed days', () => {
    const s = streakAt([...closed, k(24)], day(24, 22), TZ)
    expect(s).toMatchObject({ count: 1, alive: true, totalClosed: 3, level: 1 })
  })

  it('Sunday 23:58 Lima close counts for Sunday, not Monday', () => {
    const sunLate = '2026-10-26T04:58:00.000Z' // Sun 25 23:58 Lima
    expect(streakAt([k(25)], sunLate, TZ)).toMatchObject({ count: 1, alive: true })
  })
})
