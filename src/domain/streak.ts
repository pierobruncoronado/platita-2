// Daily close, streak and level (spec §4 "Daily close mechanics" + "Gamification rule").
// Rewards ONLY the habit of closing the day: nothing here reads amounts or record counts.
// Days are civil days in the configured timezone, as "YYYY-MM-DD" keys.
import { civilDateOf, mondayOfWeek, toMs, weekIdOf, type CivilDate } from './time'

// A run survives up to this many fully-passed days without a close; the next one breaks it.
export const MAX_MISSED_DAYS = 2

const MS_DAY = 86_400_000

export function dayKey(iso: string, tz: string): string {
  const d = civilDateOf(toMs(iso), tz)
  return keyOf(d)
}

function keyOf(d: CivilDate): string {
  return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY)
}

export function isClosedToday(closedDays: string[], now: string, tz: string): boolean {
  return closedDays.includes(dayKey(now, tz))
}

export interface Streak {
  count: number // closed days in the current run; 0 when broken or nothing closed yet
  alive: boolean
  totalClosed: number
  level: number // placeholder: floor(sqrt(closed days)) (spec decision 5)
}

export function streakAt(closedDays: string[], now: string, tz: string): Streak {
  const days = [...new Set(closedDays)].sort()
  const totalClosed = days.length
  const level = Math.floor(Math.sqrt(totalClosed))
  if (totalClosed === 0) return { count: 0, alive: false, totalClosed, level }

  const today = dayNumber(dayKey(now, tz))
  // Days strictly between the last close and today have fully passed without a close.
  const passedSinceLast = today - dayNumber(days[days.length - 1]) - 1
  if (passedSinceLast > MAX_MISSED_DAYS) return { count: 0, alive: false, totalClosed, level }

  // Walk back while the gap between consecutive closes stays within the tolerance.
  let count = 1
  for (let i = days.length - 1; i > 0; i--) {
    if (dayNumber(days[i]) - dayNumber(days[i - 1]) - 1 > MAX_MISSED_DAYS) break
    count++
  }
  return { count, alive: true, totalClosed, level }
}

export interface WeekCloses {
  closed: number
  elapsed: number // days of the week up to today, counted from the opening day if it opened mid-week
}

// "4 días cerrados de 4" (Semana board).
export function weekCloses(closedDays: string[], now: string, tz: string, openingAt: string): WeekCloses {
  const weekId = weekIdOf(now, tz)
  const monday = mondayOfWeek(weekId)
  const today = dayNumber(dayKey(now, tz))
  const first = Math.max(dayNumber(keyOf(monday)), dayNumber(dayKey(openingAt, tz)))
  const set = new Set(closedDays)
  let closed = 0
  for (let n = first; n <= today; n++) {
    const d = new Date(n * MS_DAY)
    const key = keyOf({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() })
    if (set.has(key)) closed++
  }
  return { closed, elapsed: Math.max(1, today - first + 1) }
}
