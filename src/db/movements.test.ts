import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { PlatitaDB } from './db'
import { confirmIncome, createExpense, createIncome, setUndone, updateExpense, updateIncome } from './movements'

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

  it('ingreso suelto: known source only, confirmed, counts as income', async () => {
    const db = freshDb()
    const m = await createIncome(db, { amountCents: 6000, source: 'Abuelo', note: '', occurredAt: NOW }, NOW, TZ)
    expect(m).toMatchObject({ type: 'income', status: 'confirmed', source: 'Abuelo', recurringId: null, amountCents: 6000 })
    await expect(createIncome(db, { amountCents: 6000, source: 'Tío', note: '', occurredAt: NOW }, NOW, TZ)).rejects.toThrow()
    await expect(createIncome(db, { amountCents: 0, source: 'Papá', note: '', occurredAt: NOW }, NOW, TZ)).rejects.toThrow()
    expect(await db.movements.count()).toBe(1)
  })

  it('confirmIncome: partial leaves the rest, a second confirmation settles, a third is refused', async () => {
    const db = freshDb()
    const item = {
      id: 'reposicion-claude:2026-11',
      templateId: 'reposicion-claude',
      label: 'Reposición Claude',
      amountCents: 8000,
      windowStart: '2026-11-07T05:00:00.000Z',
      windowEnd: '2026-11-15T05:00:00.000Z',
    }
    const at = '2026-11-08T15:00:00.000Z'
    const first = await confirmIncome(db, item, 5000, '', at, at, TZ)
    expect(first).toMatchObject({ recurringId: item.id, source: 'Reposición Claude', amountCents: 5000, weekId: '2026-W45' })
    await confirmIncome(db, item, 5000, 'me dio de más', at, at, TZ) // over-pays the S/30 remainder
    await expect(confirmIncome(db, item, 100, '', at, at, TZ)).rejects.toThrow(/settled/)
    expect(await db.movements.count()).toBe(2)
  })

  it('confirmIncome refuses a date before the expected window', async () => {
    const db = freshDb()
    const item = {
      id: 'reposicion-claude:2026-11',
      templateId: 'reposicion-claude',
      label: 'Reposición Claude',
      amountCents: 8000,
      windowStart: '2026-11-07T05:00:00.000Z',
      windowEnd: '2026-11-15T05:00:00.000Z',
    }
    await expect(confirmIncome(db, item, 8000, '', '2026-10-30T15:00:00.000Z', '2026-11-08T15:00:00.000Z', TZ)).rejects.toThrow(/window/)
    expect(await db.movements.count()).toBe(0)
  })

  it('updateIncome keeps the recurring source and refuses expenses', async () => {
    const db = freshDb()
    const item = {
      id: 'mesada-papa:2026-W42',
      templateId: 'mesada-papa',
      label: 'Mesada papá',
      amountCents: 10000,
      windowStart: '2026-10-12T05:00:00.000Z',
      windowEnd: '2026-10-16T05:00:00.000Z',
    }
    const paid = await confirmIncome(db, item, 10000, '', NOW, NOW, TZ)
    await updateIncome(db, paid.id, { amountCents: 9000, source: 'Otro', note: 'faltó 10', occurredAt: NOW }, TZ)
    expect(await db.movements.get(paid.id)).toMatchObject({ amountCents: 9000, source: 'Mesada papá', note: 'faltó 10' })
    const exp = await createExpense(db, pasaje, NOW, TZ)
    await expect(updateIncome(db, exp.id, { amountCents: 100, source: 'Papá', note: '', occurredAt: NOW }, TZ)).rejects.toThrow()
  })

  it('rejects zero amounts, unknown categories and mismatched subtypes (nothing written)', async () => {
    const db = freshDb()
    await expect(createExpense(db, { ...pasaje, amountCents: 0 }, NOW, TZ)).rejects.toThrow()
    await expect(createExpense(db, { ...pasaje, category: 'ropa' }, NOW, TZ)).rejects.toThrow()
    await expect(createExpense(db, { ...pasaje, category: 'bebidas' }, NOW, TZ)).rejects.toThrow()
    expect(await db.movements.count()).toBe(0)
  })
})
