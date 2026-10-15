import { categoryById } from '../domain/catalog'
import { weekIdOf } from '../domain/time'
import type { Movement, PlatitaDB } from './db'

export interface ExpenseInput {
  amountCents: number
  category: string
  subtype: string | null
  note: string
  occurredAt: string // ISO instant
}

function validate(input: ExpenseInput): void {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('amount must be positive integer cents')
  }
  const category = categoryById(input.category)
  if (!category) throw new Error(`unknown category: ${input.category}`)
  if (input.subtype !== null && !category.subtypes.includes(input.subtype)) {
    throw new Error(`unknown subtype ${input.subtype} for ${input.category}`)
  }
  if (Number.isNaN(Date.parse(input.occurredAt))) throw new Error('occurredAt must be an ISO instant')
}

export async function createExpense(db: PlatitaDB, input: ExpenseInput, now: string, tz: string): Promise<Movement> {
  validate(input)
  const movement: Movement = {
    id: crypto.randomUUID(),
    type: 'expense',
    amountCents: input.amountCents,
    category: input.category,
    subtype: input.subtype,
    note: input.note.trim(),
    occurredAt: input.occurredAt,
    createdAt: now,
    weekId: weekIdOf(input.occurredAt, tz),
    recurringId: null,
    source: null,
    status: 'confirmed',
    undone: false,
  }
  await db.movements.add(movement)
  return movement
}

export async function updateExpense(db: PlatitaDB, id: string, input: ExpenseInput, tz: string): Promise<void> {
  validate(input)
  await db.transaction('rw', db.movements, async () => {
    const current = await db.movements.get(id)
    if (!current) throw new Error(`movement not found: ${id}`)
    if (current.undone) throw new Error(`movement is undone: ${id}`)
    await db.movements.update(id, {
      amountCents: input.amountCents,
      category: input.category,
      subtype: input.subtype,
      note: input.note.trim(),
      occurredAt: input.occurredAt,
      weekId: weekIdOf(input.occurredAt, tz),
    })
  })
}

export async function setUndone(db: PlatitaDB, id: string, undone: boolean): Promise<void> {
  const updated = await db.movements.update(id, { undone })
  if (updated === 0) throw new Error(`movement not found: ${id}`)
}
