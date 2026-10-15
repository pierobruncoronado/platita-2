import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { PlatitaDB } from './db'
import { createExpense, setUndone, updateExpense } from './movements'

const TZ = 'America/Lima'
const NOW = '2026-10-16T13:05:00.000Z' // Fri 08:05 Lima

let n = 0
const dbs: PlatitaDB[] = []
function freshDb(): PlatitaDB {
  const db = new PlatitaDB(`mov-${n++}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

const pasaje = { amountCents: 200, category: 'transporte', subtype: 'Pasaje', note: '', occurredAt: NOW }

describe('movements repository', () => {
  it('creates one confirmed expense with its week snapshot', async () => {
    const db = freshDb()
    const m = await createExpense(db, pasaje, NOW, TZ)
    expect(await db.movements.toArray()).toEqual([m])
    expect(m).toMatchObject({ type: 'expense', status: 'confirmed', undone: false, weekId: '2026-W42', amountCents: 200 })
  })

  it('undo marks the movement undone instead of deleting it (export keeps it)', async () => {
    const db = freshDb()
    const m = await createExpense(db, pasaje, NOW, TZ)
    await setUndone(db, m.id, true)
    expect(await db.movements.get(m.id)).toMatchObject({ undone: true })
  })

  it('delete then Deshacer restores the movement (undone false again)', async () => {
    const db = freshDb()
    const m = await createExpense(db, pasaje, NOW, TZ)
    await setUndone(db, m.id, true)
    await setUndone(db, m.id, false)
    expect(await db.movements.get(m.id)).toMatchObject({ undone: false, amountCents: 200 })
  })

  it('editing the note keeps the amount (eval 9 data path)', async () => {
    const db = freshDb()
    const snack = await createExpense(db, { ...pasaje, amountCents: 700, category: 'comida', subtype: 'Snack' }, NOW, TZ)
    await updateExpense(db, snack.id, { ...snack, category: 'comida', note: '  pan y empanada ' }, TZ)
    expect(await db.movements.get(snack.id)).toMatchObject({ amountCents: 700, note: 'pan y empanada' })
  })

  it('refuses to edit an undone movement (its changes would never count)', async () => {
    const db = freshDb()
    const m = await createExpense(db, pasaje, NOW, TZ)
    await setUndone(db, m.id, true)
    await expect(updateExpense(db, m.id, { ...pasaje, amountCents: 900 }, TZ)).rejects.toThrow(/undone/)
    expect(await db.movements.get(m.id)).toMatchObject({ amountCents: 200 })
  })

  it('rejects zero amounts, unknown categories and mismatched subtypes (nothing written)', async () => {
    const db = freshDb()
    await expect(createExpense(db, { ...pasaje, amountCents: 0 }, NOW, TZ)).rejects.toThrow()
    await expect(createExpense(db, { ...pasaje, category: 'ropa' }, NOW, TZ)).rejects.toThrow()
    await expect(createExpense(db, { ...pasaje, category: 'bebidas' }, NOW, TZ)).rejects.toThrow()
    expect(await db.movements.count()).toBe(0)
  })
})
