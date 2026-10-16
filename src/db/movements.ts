import { categoryById, INCOME_SOURCES } from '../domain/catalog'
import { confirmExpected, type ExpectedItem } from '../domain/expected'
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

// ---------- Income ----------

export interface IncomeInput {
  amountCents: number
  source: string // one of INCOME_SOURCES for one-off income; ignored on edits of a recurring confirmation
  note: string
  occurredAt: string
}

function validateIncome(input: IncomeInput, requireKnownSource: boolean): void {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('amount must be positive integer cents')
  }
  if (requireKnownSource && !INCOME_SOURCES.includes(input.source)) {
    throw new Error(`unknown income source: ${input.source}`)
  }
  if (Number.isNaN(Date.parse(input.occurredAt))) throw new Error('occurredAt must be an ISO instant')
}

// "Ingreso suelto": confirmed one-off income (abuelo, hermana…).
export async function createIncome(db: PlatitaDB, input: IncomeInput, now: string, tz: string): Promise<Movement> {
  validateIncome(input, true)
  const movement: Movement = {
    id: crypto.randomUUID(),
    type: 'income',
    amountCents: input.amountCents,
    category: null,
    subtype: null,
    note: input.note.trim(),
    occurredAt: input.occurredAt,
    createdAt: now,
    weekId: weekIdOf(input.occurredAt, tz),
    recurringId: null,
    source: input.source,
    status: 'confirmed',
    undone: false,
  }
  await db.movements.add(movement)
  return movement
}

// Full or partial confirmation of an expected item. Refuses an already-settled item.
export async function confirmIncome(
  db: PlatitaDB,
  item: ExpectedItem,
  amountCents: number,
  note: string,
  occurredAt: string,
  now: string,
  tz: string,
): Promise<Movement> {
  validateIncome({ amountCents, source: item.label, note, occurredAt }, false)
  // A confirmation dated before the item's window would land in an unrelated (maybe closed) week.
  if (occurredAt < item.windowStart) throw new Error(`confirmation before the window of ${item.id}`)
  return db.transaction('rw', db.movements, async () => {
    const related = await db.movements.where('recurringId').equals(item.id).toArray()
    const movement = { ...confirmExpected(item, related, amountCents, now, tz, crypto.randomUUID(), occurredAt), note: note.trim() }
    await db.movements.add(movement)
    return movement
  })
}

export async function updateIncome(db: PlatitaDB, id: string, input: IncomeInput, tz: string): Promise<void> {
  await db.transaction('rw', db.movements, async () => {
    const current = await db.movements.get(id)
    if (!current || current.type !== 'income') throw new Error(`income not found: ${id}`)
    if (current.undone) throw new Error(`movement is undone: ${id}`)
    const recurring = current.recurringId !== null
    validateIncome(input, !recurring)
    await db.movements.update(id, {
      amountCents: input.amountCents,
      source: recurring ? current.source : input.source,
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
