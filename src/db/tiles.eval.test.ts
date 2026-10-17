// "Editar" the quick tile amounts, in plain language. Run on demand: npm run test:evals
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveTiles } from '../domain/tiles'
import { PlatitaDB } from './db'
import { createExpense } from './movements'
import { getTileAmounts, resetTileAmount, setTileAmount } from './tiles'

let n = 0
const dbs: PlatitaDB[] = []
const freshDb = () => {
  const db = new PlatitaDB(`tiles-eval-${n++}`)
  dbs.push(db)
  return db
}
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

const AT = '2026-10-21T14:00:00.000Z'

// What one tap on a tile does (Home.tapTile): book the tile's current amount.
async function tap(db: PlatitaDB, tileId: string) {
  const tile = resolveTiles((await getTileAmounts(db)) ?? {}).find((t) => t.id === tileId)!
  return createExpense(db, { amountCents: tile.amountCents, category: tile.category, subtype: tile.subtype, note: '', occurredAt: AT }, AT, 'America/Lima')
}

describe('"el pasaje ahora me cuesta 2.50"', () => {
  it('after editing Pasaje to S/2.50 one tap books S/2.50, other tiles and old expenses are untouched', async () => {
    const db = freshDb()
    const old = await tap(db, 'pasaje')
    expect(old.amountCents).toBe(200)

    await setTileAmount(db, 'pasaje', 250)
    const fresh = await tap(db, 'pasaje')
    expect(fresh).toMatchObject({ amountCents: 250, category: 'transporte', subtype: 'Pasaje' })
    expect((await tap(db, 'snack')).amountCents).toBe(700)
    expect((await db.movements.get(old.id))?.amountCents).toBe(200)
  })

  it('"Restaurar" brings the S/2 back', async () => {
    const db = freshDb()
    await setTileAmount(db, 'pasaje', 250)
    await resetTileAmount(db, 'pasaje')
    expect((await tap(db, 'pasaje')).amountCents).toBe(200)
  })

  it('a damaged or hostile setting never books a strange amount: back to the defaults', async () => {
    const db = freshDb()
    for (const junk of ['{"pasaje":0}', '{"pasaje":-200}', '{"pasaje":"dos"}', '{"pasaje":1e30}', 'basura']) {
      await db.settings.put({ key: 'tileAmounts', value: junk })
      expect((await tap(db, 'pasaje')).amountCents).toBe(200)
    }
  })
})
