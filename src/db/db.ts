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

export type SettingKey = 'timezone' | 'openingBalanceCents' | 'openingBalanceAt'

export interface Setting {
  key: SettingKey
  value: string | number
}

export class PlatitaDB extends Dexie {
  movements!: EntityTable<Movement, 'id'>
  settings!: EntityTable<Setting, 'key'>

  constructor(name = 'platita') {
    super(name)
    this.version(1).stores({
      movements: 'id, type, occurredAt, weekId, recurringId, status',
      settings: 'key',
    })
  }
}

export const db = new PlatitaDB()
