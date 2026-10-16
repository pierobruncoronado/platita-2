// Monthly view (spec §4 "Monthly view"). Pure functions.
// A week belongs to the month where its SUNDAY falls, so a month is a whole number of weeks
// and nothing is split. "Te quedó" = Σ weekly_net of those weeks.
import type { Movement } from '../db/db'
import { CATEGORIES } from './catalog'
import type { ExpectedItem, ExpectedStatus } from './expected'
import { closedWeeks, weeklyNet, type Opening } from './flow'
import { addDays, civilDateOf, isoWeekday, mondayOfWeek, toMs, weekBounds, weekIdOf, weekIdOfCivil, type CivilDate } from './time'
import { weekIncomeCents, weekSpend, type CategoryCents } from './week'

export const BASELINE_WEEKS = 4

export interface YearMonth {
  y: number
  m: number // 1-12
}

export function monthOf(now: string, tz: string): YearMonth {
  const d = civilDateOf(toMs(now), tz)
  return { y: d.y, m: d.m }
}

// Week ids whose Sunday falls in the month, oldest first.
export function monthWeekIds({ y, m }: YearMonth): string[] {
  const ids: string[] = []
  const first: CivilDate = { y, m, d: 1 }
  let sunday = addDays(first, 6 - isoWeekday(first)) // first Sunday on or after the 1st
  while (sunday.m === m) {
    ids.push(weekIdOfCivil(sunday))
    sunday = addDays(sunday, 7)
  }
  return ids
}

export interface MonthWeek {
  weekId: string
  monday: CivilDate
  incomeCents: number
  spentCents: number // everything spent, Claude included
  expectedCents: number // all still por cobrar, shown on the week in progress
}

export interface MonthSummary {
  weeks: MonthWeek[] // started weeks only (start ≤ now) that overlap the opening
  incomeCents: number
  spentCents: number
  teQuedoCents: number // Σ weekly_net
  byCategory: CategoryCents // without Claude
  claudeCents: number
}

export function monthSummary(
  movements: Movement[],
  open: { item: ExpectedItem; status: ExpectedStatus }[],
  month: YearMonth,
  now: string,
  tz: string,
  opening: Opening,
): MonthSummary {
  const nowMs = toMs(now)
  const openingMs = toMs(opening.at)
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0])) as CategoryCents
  let claudeCents = 0
  let incomeCents = 0
  let spentCents = 0
  let teQuedoCents = 0
  const weeks: MonthWeek[] = []
  const weekIds = monthWeekIds(month)
  // The week in progress shows as partial in today's month even when its Sunday is next month
  // (e.g. Wed 28 Oct, week ending Sun 1 Nov). Only the current month is viewable, so it is never counted twice.
  const currentWeek = weekIdOf(now, tz)
  const monday = mondayOfWeek(currentWeek)
  if (!weekIds.includes(currentWeek) && monday.y === month.y && monday.m === month.m) weekIds.push(currentWeek)
  for (const weekId of weekIds) {
    const { startMs, endMs } = weekBounds(weekId, tz)
    if (startMs > nowMs || endMs <= openingMs) continue // not started yet / entirely before the opening
    const income = weekIncomeCents(movements, weekId, tz, opening)
    const spend = weekSpend(movements, weekId, tz, opening)
    const spent = spend.hormigasCents + spend.claudeCents
    weeks.push({ weekId, monday: mondayOfWeek(weekId), incomeCents: income, spentCents: spent, expectedCents: 0 })
    incomeCents += income
    spentCents += spent
    teQuedoCents += weeklyNet(movements, weekId, tz, opening)
    claudeCents += spend.claudeCents
    for (const c of CATEGORIES) byCategory[c.id] += spend.byCategory[c.id]
  }
  // Everything still por cobrar is owed NOW (items only exist once their window opened), so it is drawn
  // on the week in progress — even an "atrasada" item from an older window.
  const owed = open.reduce((sum, x) => sum + x.status.remainingCents, 0)
  const current = weeks.find((w) => w.weekId === currentWeek) ?? weeks[weeks.length - 1]
  if (current) current.expectedCents = owed
  return { weeks, incomeCents, spentCents, teQuedoCents, byCategory, claudeCents }
}

export interface Baseline {
  weeksDone: number // full closed weeks since the opening, capped at BASELINE_WEEKS
  averageHormigasCents: number | null // only once BASELINE_WEEKS are done
}

// The opening week is partial (the app starts mid-week), so it never counts.
export function baselineProgress(movements: Movement[], now: string, tz: string, opening: Opening): Baseline {
  const openingWeek = weekIdOf(opening.at, tz)
  const full = closedWeeks(movements, now, tz, opening)
    .filter((c) => c.weekId !== openingWeek)
    .slice(0, BASELINE_WEEKS)
  if (full.length < BASELINE_WEEKS) return { weeksDone: full.length, averageHormigasCents: null }
  const total = full.reduce((sum, c) => sum + weekSpend(movements, c.weekId, tz, opening).hormigasCents, 0)
  return { weeksDone: BASELINE_WEEKS, averageHormigasCents: Math.round(total / BASELINE_WEEKS) }
}
