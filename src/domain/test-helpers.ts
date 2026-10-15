import type { Movement } from '../db/db'
import type { Opening } from './flow'

export const TZ = 'America/Lima'
// Opening balance instant (Thu 2026-10-15 14:31 Lima).
export const OPENING_AT = '2026-10-15T19:31:00.000Z'
export const OPENING: Opening = { balanceCents: 23084, at: OPENING_AT }

let seq = 0

export function expense(amountCents: number, occurredAt: string, extra: Partial<Movement> = {}): Movement {
  return movement({ type: 'expense', amountCents, occurredAt, category: 'Otros', ...extra })
}

export function income(amountCents: number, occurredAt: string, extra: Partial<Movement> = {}): Movement {
  return movement({ type: 'income', amountCents, occurredAt, ...extra })
}

function movement(fields: Partial<Movement> & Pick<Movement, 'type' | 'amountCents' | 'occurredAt'>): Movement {
  return {
    id: `m${seq++}`,
    category: null,
    subtype: null,
    note: '',
    createdAt: fields.occurredAt,
    weekId: '', // engine derives the week from occurredAt + tz
    recurringId: null,
    source: null,
    status: 'confirmed',
    undone: false,
    ...fields,
  }
}
