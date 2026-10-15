// Weekly flow model (spec §4): weekly_net = confirmed income − expenses dated in the week.
// Expected (unconfirmed) income never counts. Sunday close adds weekly_net to Savings.
//
// Savings is DERIVED, never accumulated: Savings at the start of a week = opening balance
// + Σ weekly_net of every earlier week. Each movement therefore counts exactly once, even
// when it is backdated into (or undone after) an already-closed week.
import type { Movement } from '../db/db'
import { nextWeekId, toMs, weekBounds, weekIdOf } from './time'

export interface Opening {
  balanceCents: number
  at: string // ISO instant; movements before it are already inside the balance
}

export interface WeekClose {
  weekId: string
  netCents: number
  savingsAfterCents: number
}

function countsInFlow(m: Movement, openingAtMs: number): boolean {
  return !m.undone && m.status === 'confirmed' && toMs(m.occurredAt) >= openingAtMs
}

function signed(m: Movement): number {
  return m.type === 'income' ? m.amountCents : -m.amountCents
}

// Net per week id, one pass over movements.
function netsByWeek(movements: Movement[], tz: string, opening: Opening): Map<string, number> {
  const openingAtMs = toMs(opening.at)
  const nets = new Map<string, number>()
  for (const m of movements) {
    if (!countsInFlow(m, openingAtMs)) continue
    const week = weekIdOf(m.occurredAt, tz)
    nets.set(week, (nets.get(week) ?? 0) + signed(m))
  }
  return nets
}

export function weeklyNet(movements: Movement[], weekId: string, tz: string, opening: Opening): number {
  return netsByWeek(movements, tz, opening).get(weekId) ?? 0
}

// Every week that has fully ended by `now` (Sun 23:59:59.999 in tz), oldest first.
export function closedWeeks(movements: Movement[], now: string, tz: string, opening: Opening): WeekClose[] {
  const nowMs = toMs(now)
  const nets = netsByWeek(movements, tz, opening)
  const closes: WeekClose[] = []
  let savings = opening.balanceCents
  for (let week = weekIdOf(opening.at, tz); weekBounds(week, tz).endMs <= nowMs; week = nextWeekId(week)) {
    const netCents = nets.get(week) ?? 0
    savings += netCents
    closes.push({ weekId: week, netCents, savingsAfterCents: savings })
  }
  return closes
}

export interface Balance {
  weekId: string
  savingsAtWeekStartCents: number
  weeklyNetCents: number
  enCuentaCents: number // savings at week start + live weekly_net
}

export function balanceAt(movements: Movement[], now: string, tz: string, opening: Opening): Balance {
  const closes = closedWeeks(movements, now, tz, opening)
  const weekId = weekIdOf(now, tz)
  const savingsAtWeekStartCents = closes.length ? closes[closes.length - 1].savingsAfterCents : opening.balanceCents
  const weeklyNetCents = weeklyNet(movements, weekId, tz, opening)
  return { weekId, savingsAtWeekStartCents, weeklyNetCents, enCuentaCents: savingsAtWeekStartCents + weeklyNetCents }
}
