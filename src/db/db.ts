import Dexie, { type EntityTable } from 'dexie'

export type MovementType = 'expense' | 'income'
export type MovementStatus = 'confirmed' | 'expected'

// Fields mirror the export contract (spec AC7). Logic over them lands in H2+.
export interface Movement {
  id: string
  type: MovementType
  amountCents: number
  category: string | null
  subtype: string | null
  note: string
  occurredAt: string // ISO instant (UTC)
  createdAt: string // ISO instant (UTC)
  weekId: string // e.g. "2026-W42", computed in the configured timezone
  recurringId: string | null
  source: string | null
  status: MovementStatus
  undone: boolean
}

// One row per closed day (civil day in the configured timezone). Never holds amounts.
export interface DayClose {
  day: string // "YYYY-MM-DD"
  closedAt: string // ISO instant
}

export type SettingKey =
  | 'timezone'
  | 'openingBalanceCents'
  | 'openingBalanceAt'
  | 'lastExportAt'
  | 'pinRecord' // JSON {salt, hash, iterations} — never the PIN itself
  | 'pinFailures'
  | 'pinLockedUntil' // epoch ms
  | 'biometricId' // WebAuthn credential id (base64url)
  | 'biometricSpike' // 'ok' | 'failed:<reason>'
  | 'tileAmounts' // JSON {tileId: cents} — only the tiles whose default was edited

export interface Setting {
  key: SettingKey
  value: string | number
}

// Last successful read of the owner's server rows, so Inicio opens offline. Plaintext on the device (PIN-gated).
export interface LedgerCacheRow {
  key: 'last'
  value: string // JSON of LedgerSnapshot
}

export class PlatitaDB extends Dexie {
  movements!: EntityTable<Movement, 'id'>
  settings!: EntityTable<Setting, 'key'>
  closes!: EntityTable<DayClose, 'day'>
  ledgerCache!: EntityTable<LedgerCacheRow, 'key'>

  constructor(name = 'platita') {
    super(name)
    this.version(1).stores({
      movements: 'id, type, occurredAt, weekId, recurringId, status',
      settings: 'key',
    })
    // v2 (H7): closed days. Additive — existing stores are untouched.
    this.version(2).stores({
      movements: 'id, type, occurredAt, weekId, recurringId, status',
      settings: 'key',
      closes: 'day',
    })
    // v3 (H3): offline cache of the server ledger. Additive — existing stores are untouched.
    this.version(3).stores({
      movements: 'id, type, occurredAt, weekId, recurringId, status',
      settings: 'key',
      closes: 'day',
      ledgerCache: 'key',
    })
  }
}

export const db = new PlatitaDB()
