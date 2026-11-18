// Read-only access to the owner's Supabase rows. Nothing here writes: the client has no INSERT/UPDATE/DELETE
// privilege (migration v2.9) and this module only calls select(). The client is injected (see ledgerClient.ts).
import type { SupabaseClient } from '@supabase/supabase-js'
import { LEDGER_COUNTRY } from '../config'
import { weekRange, type BalanceAnchor, type Currency, type LedgerMovement } from '../domain/ledger'
import { toMs } from '../domain/time'

export interface LedgerSnapshot {
  fetchedAt: string // ISO instant of the successful read
  anchors: BalanceAnchor[]
  movements: LedgerMovement[]
}

// PostgREST caps a response at 1000 rows by default. Hitting the cap means rows may be missing, and a balance
// from partial rows would be wrong: fail closed instead of showing it.
export const ROW_CAP = 1000

interface AnchorRow {
  id: unknown
  at: unknown
  amount_cents: unknown
  currency: unknown
}

interface MovementRow {
  occurred_at: unknown
  direction: unknown
  amount_cents: unknown
  currency: unknown
  kind: unknown
  counterparty: unknown
}

function isCurrency(v: unknown): v is Currency {
  return v === 'PEN' || v === 'USD'
}

// bigint columns can arrive as numbers; anything that is not a safe integer is rejected, never coerced.
export function mapAnchor(r: AnchorRow): BalanceAnchor {
  if (
    !Number.isSafeInteger(r.id) ||
    typeof r.at !== 'string' ||
    Number.isNaN(Date.parse(r.at)) ||
    !Number.isSafeInteger(r.amount_cents) ||
    !isCurrency(r.currency)
  ) {
    throw new Error('malformed balance_anchors row')
  }
  return { id: r.id as number, at: r.at, amountCents: r.amount_cents as number, currency: r.currency }
}

export function mapMovement(r: MovementRow): LedgerMovement {
  if (
    typeof r.occurred_at !== 'string' ||
    Number.isNaN(Date.parse(r.occurred_at)) ||
    (r.direction !== 'in' && r.direction !== 'out') ||
    !Number.isSafeInteger(r.amount_cents) ||
    (r.amount_cents as number) <= 0 ||
    !isCurrency(r.currency) ||
    typeof r.kind !== 'string'
  ) {
    throw new Error('malformed movements row')
  }
  return {
    occurredAt: r.occurred_at,
    direction: r.direction,
    amountCents: r.amount_cents as number,
    currency: r.currency,
    kind: r.kind,
    counterparty: typeof r.counterparty === 'string' ? r.counterparty : null,
  }
}

// The earliest instant whose rows are needed: the latest PEN anchor (balance) or the start of the week (flow).
export function sinceInstant(anchors: BalanceAnchor[], nowIso: string, tz: string): string {
  const weekStart = weekRange(nowIso, tz).startMs
  let since = weekStart
  for (const a of anchors) if (a.currency === 'PEN') since = Math.min(since, toMs(a.at))
  return new Date(since).toISOString()
}

export async function fetchSnapshot(client: SupabaseClient, nowIso: string, tz: string): Promise<LedgerSnapshot> {
  const anchorsRes = await client
    .from('balance_anchors')
    .select('id, at, amount_cents, currency')
    .eq('country', LEDGER_COUNTRY)
    .order('at', { ascending: false })
    .limit(20)
  if (anchorsRes.error) throw anchorsRes.error
  const anchors = (anchorsRes.data ?? []).map(mapAnchor)

  const since = sinceInstant(anchors, nowIso, tz)
  const movementsRes = await client
    .from('movements')
    .select('occurred_at, direction, amount_cents, currency, kind, counterparty')
    .eq('country', LEDGER_COUNTRY)
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(ROW_CAP)
  if (movementsRes.error) throw movementsRes.error
  const rows = movementsRes.data ?? []
  if (rows.length >= ROW_CAP) throw new Error('row cap reached: result may be incomplete')

  return { fetchedAt: nowIso, anchors, movements: rows.map(mapMovement) }
}

// An expired or rejected session (not a network problem): the owner must sign in again.
export function isAuthFailure(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown; status?: unknown } | null
  if (!e || typeof e !== 'object') return false
  if (e.status === 401 || e.status === 403) return true
  if (e.code === 'PGRST301' || e.code === 'PGRST303') return true
  return typeof e.message === 'string' && /jwt|not authenticated/i.test(e.message)
}
