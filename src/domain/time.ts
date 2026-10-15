// Week/day boundaries in the CONFIGURED IANA timezone, never the device zone.
// Weeks are ISO weeks (Mon 00:00 – Sun 23:59:59.999), ids like "2026-W42".

const MS_DAY = 86_400_000

export interface CivilDate {
  y: number
  m: number // 1-12
  d: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    // Throws RangeError on an invalid IANA zone (fail closed).
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(tz, f)
  }
  return f
}

export function toMs(iso: string): number {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new Error(`invalid ISO instant: ${iso}`)
  return ms
}

function zonedParts(ms: number, tz: string) {
  const out: Record<string, number> = {}
  for (const p of formatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return { y: out.year, m: out.month, d: out.day, h: out.hour, mi: out.minute, s: out.second }
}

// Offset of the zone at this instant, in ms (local wall clock − UTC).
function offsetMs(ms: number, tz: string): number {
  const p = zonedParts(ms, tz)
  const wall = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s)
  return wall - Math.floor(ms / 1000) * 1000
}

export function civilDateOf(ms: number, tz: string): CivilDate {
  const p = zonedParts(ms, tz)
  return { y: p.y, m: p.m, d: p.d }
}

function sameDate(a: CivilDate, b: CivilDate): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d
}

// First instant of the given civil date in tz (local midnight, or the first existing
// time when a DST jump skips midnight, e.g. America/Santiago).
export function startOfCivilDay(date: CivilDate, tz: string): number {
  const guess = Date.UTC(date.y, date.m - 1, date.d)
  const first = guess - offsetMs(guess, tz)
  let t = guess - offsetMs(first, tz)
  for (let i = 0; i < 4 && !sameDate(civilDateOf(t, tz), date); i++) t += 3_600_000
  if (!sameDate(civilDateOf(t, tz), date)) throw new Error(`cannot resolve start of day in ${tz}`)
  return t
}

export function addDays(date: CivilDate, days: number): CivilDate {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d) + days * MS_DAY)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

// 0 = Monday … 6 = Sunday
export function isoWeekday(date: CivilDate): number {
  return (new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay() + 6) % 7
}

export function weekIdOfCivil(date: CivilDate): string {
  const thursday = addDays(date, 3 - isoWeekday(date))
  const jan1 = Date.UTC(thursday.y, 0, 1)
  const week = 1 + Math.floor((Date.UTC(thursday.y, thursday.m - 1, thursday.d) - jan1) / MS_DAY / 7)
  return `${thursday.y}-W${String(week).padStart(2, '0')}`
}

export function weekIdOf(iso: string, tz: string): string {
  return weekIdOfCivil(civilDateOf(toMs(iso), tz))
}

export function mondayOfWeek(weekId: string): CivilDate {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekId)
  if (!match) throw new Error(`invalid week id: ${weekId}`)
  const year = Number(match[1])
  const week = Number(match[2])
  const jan4: CivilDate = { y: year, m: 1, d: 4 }
  const monday1 = addDays(jan4, -isoWeekday(jan4))
  const monday = addDays(monday1, (week - 1) * 7)
  if (weekIdOfCivil(monday) !== weekId) throw new Error(`invalid week id: ${weekId}`)
  return monday
}

// [startMs, endMs) of the week in tz.
export function weekBounds(weekId: string, tz: string): { startMs: number; endMs: number } {
  const monday = mondayOfWeek(weekId)
  return { startMs: startOfCivilDay(monday, tz), endMs: startOfCivilDay(addDays(monday, 7), tz) }
}

export function nextWeekId(weekId: string): string {
  return weekIdOfCivil(addDays(mondayOfWeek(weekId), 7))
}

export function weeksBetween(fromWeekId: string, toWeekId: string): number {
  const a = mondayOfWeek(fromWeekId)
  const b = mondayOfWeek(toWeekId)
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / MS_DAY / 7)
}
