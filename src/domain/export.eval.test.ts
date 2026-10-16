// Spec §7 eval 8 (AC7) + export details. Run on demand: npm run test:evals
import { describe, expect, it } from 'vitest'
import { confirmExpected, type ExpectedItem } from './expected'
import { buildExport, CSV_COLUMNS, daysSinceExport, exportFileBase, exportReminderDue } from './export'
import { expense, OPENING, TZ } from './test-helpers'

const NOW = '2026-11-10T17:00:00.000Z'

const reposicion: ExpectedItem = {
  id: 'reposicion-claude:2026-11',
  templateId: 'reposicion-claude',
  label: 'Reposición Claude',
  amountCents: 8000,
  windowStart: '2026-11-07T05:00:00.000Z',
  windowEnd: '2026-11-15T05:00:00.000Z',
}

describe('eval 8 (AC7): export after 3 expenses (1 undone) and 1 partial income', () => {
  const movements = [
    expense(200, '2026-11-09T13:05:00.000Z', { category: 'transporte', subtype: 'Pasaje' }),
    expense(700, '2026-11-09T18:00:00.000Z', { category: 'comida', subtype: 'Snack', note: 'pan, "empanada"\ny gaseosa' }),
    expense(2500, '2026-11-09T23:00:00.000Z', { category: 'alcohol', undone: true }),
    confirmExpected(reposicion, [], 5000, NOW, TZ, 'partial-1'),
  ]
  const out = buildExport(movements, TZ, OPENING, NOW)
  const data = JSON.parse(out.json)

  it('JSON has every record, including the undone one, with status and flags', () => {
    expect(data.movements).toHaveLength(4)
    const undone = data.movements.find((m: { amount_cents: number }) => m.amount_cents === 2500)
    expect(undone).toMatchObject({ undone: true, status: 'confirmed', category: 'Alcohol' })
    const income = data.movements.find((m: { id: string }) => m.id === 'partial-1')
    expect(income).toMatchObject({
      type: 'income',
      amount_cents: 5000,
      amount_soles: '50.00',
      recurring_id: 'reposicion-claude:2026-11',
      source: 'Reposición Claude',
      status: 'confirmed',
      week_id: '2026-W46',
    })
  })

  it('every movement carries all AC7 fields', () => {
    for (const m of data.movements) {
      for (const field of ['id', 'type', 'amount_cents', 'category', 'subtype', 'note', 'occurred_at', 'created_at', 'week_id', 'source', 'recurring_id', 'status', 'undone']) {
        expect(m).toHaveProperty(field)
      }
    }
  })

  it('settings (timezone) and opening balance are included', () => {
    expect(data.settings).toEqual({ timezone: 'America/Lima' })
    expect(data.opening_balance).toEqual({ cents: 23084, at: OPENING.at })
    expect(data.current.en_cuenta_cents).toBe(23084 - 200 - 700 + 5000)
  })

  it('money still por cobrar is exported as status "expected" (AC7), not hidden', () => {
    // November's Claude: S/80 expected, S/50 confirmed → S/30 expected row.
    expect(data.expected).toContainEqual(
      expect.objectContaining({ id: 'reposicion-claude:2026-11', status: 'expected', amount_cents: 3000, source: 'Reposición Claude' }),
    )
    for (const e of data.expected) expect(e).toMatchObject({ status: 'expected', undone: false })
  })

  it('a note starting with "=" or "+" is neutralized in the CSV (no formula injection)', () => {
    const files = buildExport([expense(100, '2026-11-09T13:00:00.000Z', { note: '=HYPERLINK("x")' })], TZ, OPENING, NOW)
    expect(files.csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(JSON.parse(files.json).movements[0].note).toBe('=HYPERLINK("x")') // JSON keeps the original
  })

  it('CSV row count matches the JSON and quoting survives commas, quotes and newlines', () => {
    expect(out.csv.charCodeAt(0)).toBe(0xfeff) // BOM for spreadsheet apps
    const body = out.csv.slice(1)
    expect(body.startsWith(CSV_COLUMNS.join(','))).toBe(true)
    expect(out.movementCount).toBe(4)
    expect(out.rowCount).toBe(4 + data.expected.length)
    // Parse minimally: count records outside quotes.
    let records = 0
    let quoted = false
    for (let i = 0; i < body.length; i++) {
      const ch = body[i]
      if (ch === '"') quoted = !quoted
      else if (ch === '\n' && !quoted) records++
    }
    expect(records - 1).toBe(data.movements.length + data.expected.length) // minus header
    expect(body).toContain('"pan, ""empanada""\ny gaseosa"')
  })
})

describe('export helpers', () => {
  it('file name uses the Lima date', () => {
    expect(exportFileBase('2026-10-17T03:00:00.000Z', TZ)).toBe('platita-export-2026-10-16')
  })

  it('weekly reminder: due when never exported or 7+ calendar days ago (Lima)', () => {
    expect(exportReminderDue(null, NOW, TZ)).toBe(true)
    expect(exportReminderDue('2026-11-04T17:00:00.000Z', NOW, TZ)).toBe(false) // 6 days
    expect(exportReminderDue('2026-11-03T17:00:00.000Z', NOW, TZ)).toBe(true) // 7 days
  })

  it('days since export: calendar days in Lima, never negative', () => {
    expect(daysSinceExport('2026-11-10T03:30:00.000Z', NOW, TZ)).toBe(1) // Mon 22:30 Lima → "ayer" on Tue
    expect(daysSinceExport('2026-11-10T17:00:05.000Z', NOW, TZ)).toBe(0) // UI clock 5 s behind → "hoy", not -1
    expect(daysSinceExport('2027-01-10T17:00:00.000Z', NOW, TZ)).toBeNull() // exported with a wrong future clock
    expect(exportReminderDue('2027-01-10T17:00:00.000Z', NOW, TZ)).toBe(true)
  })
})
