// Expected income: recurring templates → per-period instances. Confirmations are income
// movements whose recurringId is the instance id, so movements stay the single source of truth.
import type { Movement } from '../db/db'
import {
  addDays,
  civilDateOf,
  mondayOfWeek,
  nextWeekId,
  startOfCivilDay,
  toMs,
  weekIdOf,
  weeksBetween,
  type CivilDate,
} from './time'

export type Cadence =
  // Window = first `windowDays` days of each ISO week (mesada: Mon–Thu → 4).
  | { kind: 'weekly'; windowDays: number }
  // Every 2 weeks counted from anchorWeekId; window = first `windowDays` days of that week.
  | { kind: 'biweekly'; anchorWeekId: string; windowDays: number }
  // Window = fromDay 00:00 … toDay 23:59:59.999 of each month.
  | { kind: 'monthly'; fromDay: number; toDay: number }

export interface RecurringTemplate {
  id: string
  label: string
  shortLabel: string // Inicio "Te deben" line
  windowLabel: string // human window, e.g. "de lun a jue"
  amountCents: number
  cadence: Cadence
  activeFrom: string // ISO instant; periods whose window ended before this are not generated
}

export interface ExpectedItem {
  id: string // `${templateId}:${periodKey}`, stable → generation is idempotent
  templateId: string | null
  label: string
  amountCents: number
  windowStart: string // ISO instant, inclusive
  windowEnd: string // ISO instant, exclusive
}

export type ExpectedState = 'pending' | 'overdue' | 'settled'

export interface ExpectedStatus {
  state: ExpectedState
  confirmedCents: number
  remainingCents: number // "por cobrar"
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

function instance(t: RecurringTemplate, periodKey: string, start: CivilDate, endExclusive: CivilDate, tz: string): ExpectedItem {
  return {
    id: `${t.id}:${periodKey}`,
    templateId: t.id,
    label: t.label,
    amountCents: t.amountCents,
    windowStart: iso(startOfCivilDay(start, tz)),
    windowEnd: iso(startOfCivilDay(endExclusive, tz)),
  }
}

function weeklyInstances(t: RecurringTemplate, fromMs: number, nowMs: number, tz: string, windowDays: number, every: number, anchor?: string): ExpectedItem[] {
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 7) {
    throw new Error(`invalid weekly windowDays ${windowDays}`)
  }
  const out: ExpectedItem[] = []
  for (let week = weekIdOf(iso(fromMs), tz); ; week = nextWeekId(week)) {
    const monday = mondayOfWeek(week)
    if (startOfCivilDay(monday, tz) > nowMs) break
    if (anchor && ((weeksBetween(anchor, week) % every) + every) % every !== 0) continue
    const item = instance(t, week, monday, addDays(monday, windowDays), tz)
    if (toMs(item.windowEnd) > fromMs) out.push(item)
  }
  return out
}

function monthlyInstances(t: RecurringTemplate, fromMs: number, nowMs: number, tz: string, fromDay: number, toDay: number): ExpectedItem[] {
  if (!(1 <= fromDay && fromDay <= toDay && toDay <= 28)) {
    throw new Error(`invalid monthly window ${fromDay}–${toDay}`)
  }
  const out: ExpectedItem[] = []
  let { y, m } = civilDateOf(fromMs, tz)
  for (;;) {
    const start: CivilDate = { y, m, d: fromDay }
    if (startOfCivilDay(start, tz) > nowMs) break
    const key = `${y}-${String(m).padStart(2, '0')}`
    const item = instance(t, key, start, addDays({ y, m, d: toDay }, 1), tz)
    if (toMs(item.windowEnd) > fromMs) out.push(item)
    if (m === 12) {
      y += 1
      m = 1
    } else {
      m += 1
    }
  }
  return out
}

// All instances whose window has started by `now` (past ones included: never silently dropped).
export function generateExpected(templates: RecurringTemplate[], now: string, tz: string): ExpectedItem[] {
  const nowMs = toMs(now)
  return templates.flatMap((t) => {
    const fromMs = toMs(t.activeFrom)
    const c = t.cadence
    switch (c.kind) {
      case 'weekly':
        return weeklyInstances(t, fromMs, nowMs, tz, c.windowDays, 1)
      case 'biweekly':
        mondayOfWeek(c.anchorWeekId) // validates the anchor
        return weeklyInstances(t, fromMs, nowMs, tz, c.windowDays, 2, c.anchorWeekId)
      case 'monthly':
        return monthlyInstances(t, fromMs, nowMs, tz, c.fromDay, c.toDay)
    }
  })
}

export function confirmedCents(item: ExpectedItem, movements: Movement[]): number {
  let sum = 0
  for (const m of movements) {
    if (m.recurringId === item.id && m.type === 'income' && m.status === 'confirmed' && !m.undone) {
      sum += m.amountCents
    }
  }
  return sum
}

export function expectedStatus(item: ExpectedItem, movements: Movement[], now: string): ExpectedStatus {
  const confirmed = confirmedCents(item, movements)
  const remainingCents = Math.max(0, item.amountCents - confirmed)
  let state: ExpectedState
  if (remainingCents === 0) state = 'settled'
  else if (toMs(now) >= toMs(item.windowEnd)) state = 'overdue'
  else state = 'pending'
  return { state, confirmedCents: confirmed, remainingCents }
}

// Full or partial confirmation → a confirmed income dated now (or `occurredAt` when the
// date chip was used). Paying more than the remainder is allowed: the income records the real amount.
export function confirmExpected(
  item: ExpectedItem,
  movements: Movement[],
  amountCents: number,
  now: string,
  tz: string,
  id: string,
  occurredAt: string = now,
): Movement {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('confirmation amount must be positive integer cents')
  }
  if (expectedStatus(item, movements, now).state === 'settled') {
    throw new Error(`expected item already settled: ${item.id}`)
  }
  return {
    id,
    type: 'income',
    amountCents,
    category: null,
    subtype: null,
    note: '',
    occurredAt,
    createdAt: now,
    weekId: weekIdOf(occurredAt, tz),
    recurringId: item.id,
    source: item.label,
    status: 'confirmed',
    undone: false,
  }
}

// Items still por cobrar (pending or overdue), oldest first.
export function openExpected(items: ExpectedItem[], movements: Movement[], now: string): { item: ExpectedItem; status: ExpectedStatus }[] {
  return items
    .map((item) => ({ item, status: expectedStatus(item, movements, now) }))
    .filter((x) => x.status.state !== 'settled')
    .sort((a, b) => a.item.windowStart.localeCompare(b.item.windowStart))
}

// "Si llega lo esperado" = En cuenta + everything still por cobrar (pending and overdue).
export function ifExpectedArrives(enCuentaCents: number, items: ExpectedItem[], movements: Movement[], now: string): number {
  let total = enCuentaCents
  for (const item of items) total += expectedStatus(item, movements, now).remainingCents
  return total
}
