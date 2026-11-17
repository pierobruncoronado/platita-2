// v2 read-only numbers from Supabase rows (spec v2): balance = last anchor + later PEN movements;
// flow per period = out (outgoing − refunds) / in (incoming without refunds) / net = in − out.
// Pure functions. Periods come from time.ts (configured IANA zone, never the device zone).
// Input is ONLY server rows: v1 local movements (quick tiles) and expected income are not accepted.
import { addDays, civilDateOf, startOfCivilDay, toMs, weekBounds, weekIdOf } from './time'

export type Currency = 'PEN' | 'USD'

// A row of public.movements, mapped to camelCase by the data layer.
export interface LedgerMovement {
  occurredAt: string
  direction: 'in' | 'out'
  amountCents: number
  currency: Currency
  kind: string
}

// A row of public.balance_anchors.
export interface BalanceAnchor {
  id: number
  at: string
  amountCents: number
  currency: Currency
}

export interface Flow {
  outCents: number
  inCents: number
  netCents: number
}

export interface PeriodRange {
  startMs: number // inclusive
  endMs: number // exclusive
}

// Fail closed: a row that is not shaped like a server movement (e.g. a v1 local one) is rejected,
// never silently counted.
function assertLedgerMovement(m: LedgerMovement): void {
  const ok =
    (m.direction === 'in' || m.direction === 'out') &&
    (m.currency === 'PEN' || m.currency === 'USD') &&
    Number.isInteger(m.amountCents) &&
    m.amountCents > 0 &&
    typeof m.occurredAt === 'string' &&
    typeof m.kind === 'string'
  if (!ok) throw new Error('not a ledger movement (server rows only)')
}

export function latestPenAnchor(anchors: BalanceAnchor[]): BalanceAnchor | null {
  let best: BalanceAnchor | null = null
  for (const a of anchors) {
    if (a.currency !== 'PEN') continue
    if (!best || toMs(a.at) > toMs(best.at) || (toMs(a.at) === toMs(best.at) && a.id > best.id)) best = a
  }
  return best
}

// Last anchor + PEN movements strictly after it (in = +, out = −). Never recomputed from history.
// USD movements never touch it. null when there is no PEN anchor: no number is invented.
export function balancePenCents(anchors: BalanceAnchor[], movements: LedgerMovement[]): number | null {
  const anchor = latestPenAnchor(anchors)
  if (!anchor) return null
  const anchorMs = toMs(anchor.at)
  let balance = anchor.amountCents
  for (const m of movements) {
    assertLedgerMovement(m)
    if (m.currency !== 'PEN' || toMs(m.occurredAt) <= anchorMs) continue
    balance += m.direction === 'in' ? m.amountCents : -m.amountCents
  }
  return balance
}

// One currency at a time: PEN and USD are never added together.
export function flowOf(movements: LedgerMovement[], range: PeriodRange, currency: Currency): Flow {
  let outCents = 0
  let inCents = 0
  for (const m of movements) {
    assertLedgerMovement(m)
    if (m.currency !== currency) continue
    const ms = toMs(m.occurredAt)
    if (ms < range.startMs || ms >= range.endMs) continue
    if (m.direction === 'out') outCents += m.amountCents
    else if (m.kind === 'refund') outCents -= m.amountCents
    else inCents += m.amountCents
  }
  return { outCents, inCents, netCents: inCents - outCents }
}

export function dayRange(nowIso: string, tz: string): PeriodRange {
  const day = civilDateOf(toMs(nowIso), tz)
  return { startMs: startOfCivilDay(day, tz), endMs: startOfCivilDay(addDays(day, 1), tz) }
}

export function weekRange(nowIso: string, tz: string): PeriodRange {
  return weekBounds(weekIdOf(nowIso, tz), tz)
}

export interface HomeNumbers {
  weekId: string
  balancePenCents: number | null
  todayPen: Flow
  weekPen: Flow
  // A USD charge on the PEN account is shown apart, with no exchange rate (spec).
  todayUsd: Flow
  weekUsd: Flow
}

export function homeNumbers(
  anchors: BalanceAnchor[],
  movements: LedgerMovement[],
  nowIso: string,
  tz: string,
): HomeNumbers {
  const today = dayRange(nowIso, tz)
  const week = weekRange(nowIso, tz)
  return {
    weekId: weekIdOf(nowIso, tz),
    balancePenCents: balancePenCents(anchors, movements),
    todayPen: flowOf(movements, today, 'PEN'),
    weekPen: flowOf(movements, week, 'PEN'),
    todayUsd: flowOf(movements, today, 'USD'),
    weekUsd: flowOf(movements, week, 'USD'),
  }
}
