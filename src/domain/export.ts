// "Exportar todo" (spec AC7): every movement with full metadata, built for an LLM to analyze.
import type { Movement } from '../db/db'
import { categoryById, RECURRING_TEMPLATES } from './catalog'
import { generateExpected, openExpected } from './expected'
import { closedWeeks, weeklyNet, type Opening } from './flow'
import { toDateTimeInput } from './labels'
import { civilDateOf, toMs, weekIdOf } from './time'

export const EXPORT_SCHEMA_VERSION = 1

export const CSV_COLUMNS = [
  'id',
  'type',
  'amount_cents',
  'amount_soles',
  'category',
  'subtype',
  'note',
  'occurred_at',
  'occurred_at_local',
  'created_at',
  'week_id',
  'source',
  'recurring_id',
  'status',
  'undone',
  'before_opening_balance',
] as const

type Row = Record<(typeof CSV_COLUMNS)[number], string | number | boolean | null>

function row(m: Movement, tz: string, opening: Opening): Row {
  return {
    id: m.id,
    type: m.type,
    amount_cents: m.amountCents,
    amount_soles: (m.amountCents / 100).toFixed(2),
    category: categoryById(m.category)?.label ?? m.category,
    subtype: m.subtype,
    note: m.note,
    occurred_at: m.occurredAt,
    occurred_at_local: toDateTimeInput(m.occurredAt, tz),
    created_at: m.createdAt,
    week_id: weekIdOf(m.occurredAt, tz), // recomputed: the engine's source of truth, not the stored snapshot
    source: m.source,
    recurring_id: m.recurringId,
    status: m.status,
    undone: m.undone,
    before_opening_balance: toMs(m.occurredAt) < toMs(opening.at), // same comparison as the flow engine
  }
}

function csvCell(v: string | number | boolean | null): string {
  if (v === null) return ''
  let s = String(v)
  // A text cell starting with = + - @ would run as a formula in Sheets/Excel (CSV injection).
  if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export interface ExportFiles {
  json: string
  csv: string
  rowCount: number // CSV data rows (movements + expected)
  movementCount: number
}

export function buildExport(movements: Movement[], tz: string, opening: Opening, now: string): ExportFiles {
  const sorted = [...movements].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
  const rows = sorted.map((m) => row(m, tz, opening))
  // Money still por cobrar is derived, not stored: exported as status "expected" rows (spec AC7).
  const open = openExpected(generateExpected(RECURRING_TEMPLATES, now, tz), movements, now)
  const expectedRows: Row[] = open.map(({ item, status }) => ({
    id: item.id,
    type: 'income',
    amount_cents: status.remainingCents,
    amount_soles: (status.remainingCents / 100).toFixed(2),
    category: null,
    subtype: null,
    note: status.state === 'overdue' ? 'por cobrar (atrasada)' : 'por cobrar',
    occurred_at: item.windowStart,
    occurred_at_local: toDateTimeInput(item.windowStart, tz),
    created_at: now,
    week_id: weekIdOf(item.windowStart, tz),
    source: item.label,
    recurring_id: item.id,
    status: 'expected',
    undone: false,
    before_opening_balance: false,
  }))
  const closes = closedWeeks(movements, now, tz, opening)
  const weekId = weekIdOf(now, tz)
  const savingsAtWeekStart = closes.length ? closes[closes.length - 1].savingsAfterCents : opening.balanceCents
  const net = weeklyNet(movements, weekId, tz, opening)

  const json = JSON.stringify(
    {
      app: 'Platita',
      schema_version: EXPORT_SCHEMA_VERSION,
      exported_at: now,
      currency: 'PEN',
      settings: { timezone: tz },
      opening_balance: { cents: opening.balanceCents, at: opening.at },
      current: {
        week_id: weekId,
        en_cuenta_cents: savingsAtWeekStart + net,
        savings_at_week_start_cents: savingsAtWeekStart,
        weekly_net_cents: net,
      },
      weeks_closed: closes.map((w) => ({
        week_id: w.weekId,
        net_cents: w.netCents,
        savings_after_cents: w.savingsAfterCents,
      })),
      recurring_templates: RECURRING_TEMPLATES.map((t) => ({ id: t.id, label: t.label, amount_cents: t.amountCents, cadence: t.cadence })),
      notes_for_analysis: [
        'Amounts are integer cents of Peruvian soles (PEN).',
        'Weekly flow = confirmed income − expenses dated in the week (Mon 00:00–Sun 23:59, settings.timezone).',
        'Rows with undone=true were cancelled by the user and do not count.',
        'Rows with before_opening_balance=true are already included in the opening balance and do not count.',
        'expected = income still owed (status "expected", amount = remaining); it never counts until confirmed.',
      ],
      movements: rows,
      expected: expectedRows,
    },
    null,
    2,
  )

  const allRows = [...rows, ...expectedRows]
  const lines = [CSV_COLUMNS.join(','), ...allRows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(','))]
  // UTF-8 BOM so spreadsheet apps read "Menú" / "Papá" correctly.
  const csv = String.fromCharCode(0xfeff) + lines.join('\r\n') + '\r\n'

  return { json, csv, rowCount: allRows.length, movementCount: rows.length }
}

export function exportFileBase(now: string, tz: string): string {
  return `platita-export-${toDateTimeInput(now, tz).slice(0, 10)}`
}

// Weekly reminder: due when never exported or 7+ days since the last export.
export const EXPORT_REMINDER_DAYS = 7

// Calendar days in tz ("hoy", "ayer", "hace 3 días"), never negative (the UI clock may lag a fresh export).
export function daysSinceExport(lastExportAt: string | null, now: string, tz: string): number | null {
  if (!lastExportAt) return null
  // A backup "in the future" means the clock was wrong at export time: treat as unknown → reminder due.
  if (toMs(lastExportAt) - toMs(now) > 86_400_000) return null
  const day = (iso: string) => {
    const d = civilDateOf(toMs(iso), tz)
    return Date.UTC(d.y, d.m - 1, d.d) / 86_400_000
  }
  return Math.max(0, day(now) - day(lastExportAt))
}

export function exportReminderDue(lastExportAt: string | null, now: string, tz: string): boolean {
  const days = daysSinceExport(lastExportAt, now, tz)
  return days === null || days >= EXPORT_REMINDER_DAYS
}
