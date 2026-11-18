import type { PlatitaDB } from './db'
import type { LedgerSnapshot } from '../data/ledgerRead'
import { mapAnchor, mapMovement } from '../data/ledgerRead'

export async function saveSnapshot(db: PlatitaDB, snapshot: LedgerSnapshot): Promise<void> {
  try {
    await db.ledgerCache.put({ key: 'last', value: JSON.stringify(snapshot) })
  } catch (err) {
    // A failed cache write must never hide fresh data.
    console.error(JSON.stringify({ event: 'ledger_cache_write_failed', message: String(err) }))
  }
}

// null when there is nothing usable. Rows are re-validated: a damaged cache is dropped, never shown.
export async function loadSnapshot(db: PlatitaDB): Promise<LedgerSnapshot | null> {
  try {
    const row = await db.ledgerCache.get('last')
    if (!row) return null
    const raw = JSON.parse(row.value) as { fetchedAt: string; anchors: unknown[]; movements: unknown[] }
    if (typeof raw.fetchedAt !== 'string' || Number.isNaN(Date.parse(raw.fetchedAt))) return null
    return {
      fetchedAt: raw.fetchedAt,
      anchors: raw.anchors.map((a) => mapAnchor(toAnchorRow(a))),
      movements: raw.movements.map((m) => mapMovement(toMovementRow(m))),
    }
  } catch (err) {
    console.error(JSON.stringify({ event: 'ledger_cache_read_failed', message: String(err) }))
    return null
  }
}

// The cache stores camelCase snapshots; the mappers validate snake_case rows. Convert, then validate.
function toAnchorRow(a: unknown) {
  const o = a as { id: unknown; at: unknown; amountCents: unknown; currency: unknown }
  return { id: o.id, at: o.at, amount_cents: o.amountCents, currency: o.currency }
}

function toMovementRow(m: unknown) {
  const o = m as { occurredAt: unknown; direction: unknown; amountCents: unknown; currency: unknown; kind: unknown; counterparty?: unknown }
  return {
    occurred_at: o.occurredAt,
    direction: o.direction,
    amount_cents: o.amountCents,
    currency: o.currency,
    kind: o.kind,
    counterparty: o.counterparty ?? null,
  }
}
