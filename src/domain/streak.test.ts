import { describe, expect, it } from 'vitest'
import { dayKey, isClosedToday, streakAt, weekCloses } from './streak'
import { OPENING_AT, TZ } from './test-helpers'

// Lima noon of 2026-10-DD is DD 17:00Z
const at = (d: number) => `2026-10-${String(d).padStart(2, '0')}T17:00:00.000Z`
const k = (d: number) => `2026-10-${String(d).padStart(2, '0')}`

describe('dayKey', () => {
  it('uses the configured zone, not the device zone (Lima 23:30 is already the next day in UTC)', () => {
    expect(dayKey('2026-10-22T04:30:00.000Z', TZ)).toBe('2026-10-21')
    expect(dayKey('2026-10-22T04:30:00.000Z', 'UTC')).toBe('2026-10-22')
  })
})

describe('streakAt', () => {
  it('is 0 and not alive before the first close', () => {
    expect(streakAt([], at(20), TZ)).toEqual({ count: 0, alive: false, totalClosed: 0, level: 0 })
  })

  it('counts consecutive closed days and keeps the streak while today is still open', () => {
    expect(streakAt([k(15), k(16), k(17), k(18)], at(19), TZ)).toMatchObject({ count: 4, alive: true })
    expect(isClosedToday([k(18)], at(19), TZ)).toBe(false)
  })

  it('survives 2 fully-passed days without a close (spec AC6)', () => {
    // closed Mon 19; Tue 20 and Wed 21 passed without close; today Thu 22
    expect(streakAt([k(19)], at(22), TZ)).toMatchObject({ count: 1, alive: true })
  })

  it('is broken by the 3rd passed day and reads 0', () => {
    // closed Mon 19; Tue, Wed, Thu passed; today Fri 23
    expect(streakAt([k(19)], at(23), TZ)).toMatchObject({ count: 0, alive: false, totalClosed: 1 })
  })

  it('keeps counting across a tolerated gap and restarts after a broken one', () => {
    expect(streakAt([k(15), k(16), k(19), k(20)], at(20), TZ).count).toBe(4) // gap of 2 days (17, 18) tolerated
    expect(streakAt([k(15), k(16), k(20), k(21)], at(21), TZ).count).toBe(2) // gap of 3 days (17, 18, 19) broke the run
  })

  it('a close after a break starts a new run at 1', () => {
    expect(streakAt([k(15), k(16), k(24)], at(24), TZ)).toMatchObject({ count: 1, alive: true })
  })

  it('ignores duplicates', () => {
    expect(streakAt([k(20), k(20)], at(20), TZ)).toMatchObject({ count: 1, totalClosed: 1 })
  })

  it('level is floor(sqrt(closed days)) — a placeholder, never amount-based', () => {
    const days = (n: number) => Array.from({ length: n }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`)
    expect(streakAt(days(1), '2026-11-02T17:00:00.000Z', TZ).level).toBe(1)
    expect(streakAt(days(3), '2026-11-03T17:00:00.000Z', TZ).level).toBe(1)
    expect(streakAt(days(4), '2026-11-04T17:00:00.000Z', TZ).level).toBe(2)
    expect(streakAt(days(9), '2026-11-09T17:00:00.000Z', TZ).level).toBe(3)
  })
})

describe('weekCloses', () => {
  it('counts closed days out of the days elapsed this week, from the opening day when it opened mid-week', () => {
    // opening Thu 15 Oct; today Sun 18 → elapsed Thu..Sun = 4
    expect(weekCloses([k(15), k(16), k(17)], at(18), TZ, OPENING_AT)).toEqual({ closed: 3, elapsed: 4 })
  })

  it('uses Monday as the start of a full week and ignores other weeks', () => {
    expect(weekCloses([k(18), k(19), k(21)], at(22), TZ, OPENING_AT)).toEqual({ closed: 2, elapsed: 4 })
  })
})

describe('weekCloses edge', () => {
  it('never reports fewer than 1 elapsed day (opening later than today)', () => {
    expect(weekCloses([], at(14), TZ, OPENING_AT)).toEqual({ closed: 0, elapsed: 1 })
  })
})
