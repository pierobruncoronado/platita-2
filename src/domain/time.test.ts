import { describe, expect, it } from 'vitest'
import {
  addDays,
  civilDateOf,
  mondayOfWeek,
  nextWeekId,
  startOfCivilDay,
  weekBounds,
  weekIdOf,
  weeksBetween,
} from './time'

const TZ = 'America/Lima'

describe('weekIdOf (configured timezone)', () => {
  it('opening balance instant is in 2026-W42', () => {
    expect(weekIdOf('2026-10-15T19:31:00.000Z', TZ)).toBe('2026-W42')
  })

  it('Sunday 23:59:59.999 Lima stays in the week; Monday 00:00 starts the next', () => {
    expect(weekIdOf('2026-10-26T04:59:59.999Z', TZ)).toBe('2026-W43')
    expect(weekIdOf('2026-10-26T05:00:00.000Z', TZ)).toBe('2026-W44')
  })

  it('handles the ISO year boundary (2026 has 53 weeks)', () => {
    expect(weekIdOf('2027-01-01T17:00:00.000Z', TZ)).toBe('2026-W53')
    expect(nextWeekId('2026-W53')).toBe('2027-W01')
    expect(mondayOfWeek('2027-W01')).toEqual({ y: 2027, m: 1, d: 4 })
  })

  it('rejects invalid zones and week ids (fail closed)', () => {
    expect(() => weekIdOf('2026-10-15T19:31:00.000Z', 'Mars/Olympus')).toThrow()
    expect(() => mondayOfWeek('2025-W53')).toThrow()
    expect(() => weekIdOf('not-a-date', TZ)).toThrow()
  })
})

describe('weekBounds', () => {
  it('Lima week is Mon 05:00Z to next Mon 05:00Z', () => {
    const { startMs, endMs } = weekBounds('2026-W43', TZ)
    expect(new Date(startMs).toISOString()).toBe('2026-10-19T05:00:00.000Z')
    expect(new Date(endMs).toISOString()).toBe('2026-10-26T05:00:00.000Z')
  })

  it('a DST week in New York is 7 days + 1 hour long', () => {
    const { startMs, endMs } = weekBounds('2026-W44', 'America/New_York')
    expect(new Date(startMs).toISOString()).toBe('2026-10-26T04:00:00.000Z')
    expect(new Date(endMs).toISOString()).toBe('2026-11-02T05:00:00.000Z')
  })

  it('start of day is the first instant of that local date, even where DST skips midnight', () => {
    for (const tz of ['America/Lima', 'America/Santiago', 'America/New_York']) {
      for (let i = 0; i < 366; i++) {
        const date = addDays({ y: 2026, m: 1, d: 1 }, i)
        const start = startOfCivilDay(date, tz)
        expect(civilDateOf(start, tz)).toEqual(date)
        expect(civilDateOf(start - 1, tz)).toEqual(addDays(date, -1))
      }
    }
  })

  it('weeksBetween counts across years', () => {
    expect(weeksBetween('2026-W52', '2027-W02')).toBe(3)
  })
})
