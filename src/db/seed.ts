import type { Opening } from '../domain/flow'
import type { Movement, PlatitaDB, Setting } from './db'

// Spec §4: Savings opens at S/230.84 (Piero, 2026-10-15 14:31 Lima).
// Timezone is fixed to Lima until H5 adds the setting UI.
export const DEFAULT_TIMEZONE = 'America/Lima'
export const OPENING_BALANCE_CENTS = 23084
export const OPENING_BALANCE_AT = '2026-10-15T19:31:00.000Z'

const DEFAULTS: Setting[] = [
  { key: 'timezone', value: DEFAULT_TIMEZONE },
  { key: 'openingBalanceCents', value: OPENING_BALANCE_CENTS },
  { key: 'openingBalanceAt', value: OPENING_BALANCE_AT },
]

// Spec §4: S/50 of October's Claude reimbursement arrived before the opening balance.
// Dated before OPENING_BALANCE_AT, so it never moves the balance (it is inside S/230.84),
// but it counts toward the October expected item, leaving S/30 por cobrar.
export const PRE_OPENING_MOVEMENTS: Movement[] = [
  {
    id: 'seed-reposicion-claude-2026-10-pre-opening',
    type: 'income',
    amountCents: 5000,
    category: null,
    subtype: null,
    note: 'Recibido antes del saldo inicial',
    occurredAt: '2026-10-15T19:30:00.000Z',
    createdAt: OPENING_BALANCE_AT,
    weekId: '2026-W42',
    recurringId: 'reposicion-claude:2026-10',
    source: 'Reposición Claude',
    status: 'confirmed',
    undone: false,
  },
]

// Idempotent: only writes keys/rows that are missing, never overwrites existing values.
export async function seedDefaults(db: PlatitaDB): Promise<void> {
  await db.transaction('rw', db.settings, db.movements, async () => {
    for (const setting of DEFAULTS) {
      const existing = await db.settings.get(setting.key)
      if (!existing) await db.settings.add(setting)
    }
    for (const movement of PRE_OPENING_MOVEMENTS) {
      const existing = await db.movements.get(movement.id)
      if (!existing) await db.movements.add(movement)
    }
  })
}

export async function getOpeningBalanceCents(db: PlatitaDB): Promise<number> {
  const row = await db.settings.get('openingBalanceCents')
  if (!row || typeof row.value !== 'number' || !Number.isInteger(row.value)) {
    throw new Error('openingBalanceCents missing or not integer cents')
  }
  return row.value
}

export async function getOpening(db: PlatitaDB): Promise<Opening> {
  const balanceCents = await getOpeningBalanceCents(db)
  const row = await db.settings.get('openingBalanceAt')
  if (!row || typeof row.value !== 'string' || Number.isNaN(Date.parse(row.value))) {
    throw new Error('openingBalanceAt missing or not an ISO instant')
  }
  return { balanceCents, at: row.value }
}

export async function getTimezone(db: PlatitaDB): Promise<string> {
  const row = await db.settings.get('timezone')
  if (!row || typeof row.value !== 'string') {
    throw new Error('timezone setting missing')
  }
  return row.value
}
