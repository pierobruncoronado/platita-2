// Weekly breakdown for Inicio + Semana (spec §4). Pure functions.
// "Hormigas" = every confirmed expense of the week except Otros → Claude (monthly, shown apart).
// Everything still counts in weekly_net; this module only splits what the charts show.
import type { Movement } from '../db/db'
import { CATEGORIES, CLAUDE_SUBTYPE, type CategoryId } from './catalog'
import { countsInFlow, type Opening } from './flow'
import { civilDateOf, isoWeekday, toMs, weekIdOf } from './time'

export type CategoryCents = Record<CategoryId, number>

function emptyCategories(): CategoryCents {
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, 0])) as CategoryCents
}

function isCategoryId(id: string | null): id is CategoryId {
  return CATEGORIES.some((c) => c.id === id)
}

function isClaude(m: Movement): boolean {
  return m.category === 'otros' && m.subtype === CLAUDE_SUBTYPE
}

export interface WeekSpend {
  byCategory: CategoryCents // hormigas only
  hormigasCents: number
  claudeCents: number
}

export interface DaySpend {
  day: number // 0 = Monday … 6 = Sunday
  byCategory: CategoryCents // hormigas only
  hormigasCents: number
}

// Confirmed, not undone, not before the opening balance, dated in `weekId`.
function weekExpenses(movements: Movement[], weekId: string, tz: string, opening: Opening): Movement[] {
  const openingAtMs = toMs(opening.at)
  return movements.filter((m) => m.type === 'expense' && countsInFlow(m, openingAtMs) && weekIdOf(m.occurredAt, tz) === weekId)
}

// An unknown or null category is shown as Otros so the total never loses money.
function categoryOf(m: Movement): CategoryId {
  return isCategoryId(m.category) ? m.category : 'otros'
}

export function weekSpend(movements: Movement[], weekId: string, tz: string, opening: Opening): WeekSpend {
  const byCategory = emptyCategories()
  let claudeCents = 0
  for (const m of weekExpenses(movements, weekId, tz, opening)) {
    if (isClaude(m)) claudeCents += m.amountCents
    else byCategory[categoryOf(m)] += m.amountCents
  }
  const hormigasCents = Object.values(byCategory).reduce((a, b) => a + b, 0)
  return { byCategory, hormigasCents, claudeCents }
}

// Confirmed income that entered during the week (same rules as weekly_net).
export function weekIncomeCents(movements: Movement[], weekId: string, tz: string, opening: Opening): number {
  const openingAtMs = toMs(opening.at)
  let total = 0
  for (const m of movements) {
    if (m.type === 'income' && countsInFlow(m, openingAtMs) && weekIdOf(m.occurredAt, tz) === weekId) total += m.amountCents
  }
  return total
}

// Seven entries, Monday → Sunday, stacked by category (hormigas only).
export function daySpend(movements: Movement[], weekId: string, tz: string, opening: Opening): DaySpend[] {
  const days: DaySpend[] = Array.from({ length: 7 }, (_, day) => ({ day, byCategory: emptyCategories(), hormigasCents: 0 }))
  for (const m of weekExpenses(movements, weekId, tz, opening)) {
    if (isClaude(m)) continue
    const day = days[isoWeekday(civilDateOf(toMs(m.occurredAt), tz))]
    day.byCategory[categoryOf(m)] += m.amountCents
    day.hormigasCents += m.amountCents
  }
  return days
}

// Monday = 0 … Sunday = 6 in tz.
export function weekdayIndex(iso: string, tz: string): number {
  return isoWeekday(civilDateOf(toMs(iso), tz))
}

export interface SundayProjection {
  weeklyNetCents: number // what the week has produced so far
  owedCents: number // expected income still por cobrar
  projectedCents: number // what goes to Ahorro on Sunday if everything expected arrives
}

export function sundayProjection(weeklyNetCents: number, owedCents: number): SundayProjection {
  return { weeklyNetCents, owedCents, projectedCents: weeklyNetCents + owedCents }
}

// Amber below zero, green from zero up; zero is the natural limit (spec §4 colors).
export function freeTone(weeklyNetCents: number): 'ok' | 'warn' {
  return weeklyNetCents < 0 ? 'warn' : 'ok'
}
