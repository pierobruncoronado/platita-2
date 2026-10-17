import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveTiles } from '../domain/tiles'
import { PlatitaDB } from './db'
import { createExpense } from './movements'
import { getTileAmounts, resetTileAmount, setTileAmount } from './tiles'

let n = 0
const dbs: PlatitaDB[] = []
const freshDb = () => {
  const db = new PlatitaDB(`tiles-${n++}`)
  dbs.push(db)
  return db
}
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

describe('tile amounts storage', () => {
  it('starts empty (built-in defaults), saves an edit and restores one tile', async () => {
    const db = freshDb()
    expect(await getTileAmounts(db)).toEqual({})
    await setTileAmount(db, 'pasaje', 250)
    await setTileAmount(db, 'snack', 900)
    expect(await getTileAmounts(db)).toEqual({ pasaje: 250, snack: 900 })
    await resetTileAmount(db, 'pasaje')
    expect(await getTileAmounts(db)).toEqual({ snack: 900 })
  })

  it('rejects an unknown tile and invalid amounts without writing', async () => {
    const db = freshDb()
    await expect(setTileAmount(db, 'nope', 100)).rejects.toThrow()
    for (const bad of [0, -1, 2.5, 10_000_000]) await expect(setTileAmount(db, 'pasaje', bad)).rejects.toThrow()
    expect(await db.settings.count()).toBe(0)
  })

  it('a damaged value reads as defaults, but a failing read is null (never silently the defaults)', async () => {
    const db = freshDb()
    await db.settings.put({ key: 'tileAmounts', value: '{broken' })
    expect(await getTileAmounts(db)).toEqual({})
    await db.close()
    expect(await getTileAmounts(db)).toBeNull()
  })

  it('never touches past movements: only new taps use the new amount', async () => {
    const db = freshDb()
    const at = '2026-10-20T15:00:00.000Z'
    const pasaje = (amounts: Record<string, number>) => resolveTiles(amounts).find((t) => t.id === 'pasaje')!
    const input = (amountCents: number) => ({ amountCents, category: 'transporte', subtype: 'Pasaje', note: '', occurredAt: at })
    const before = await createExpense(db, input(pasaje({}).amountCents), at, 'America/Lima')
    await setTileAmount(db, 'pasaje', 250)
    const after = await createExpense(db, input(pasaje((await getTileAmounts(db)) ?? {}).amountCents), at, 'America/Lima')
    expect((await db.movements.get(before.id))?.amountCents).toBe(200)
    expect((await db.movements.get(after.id))?.amountCents).toBe(250)
  })
})
