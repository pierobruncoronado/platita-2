import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { PlatitaDB } from './db'
import { getOpeningBalanceCents, getTimezone, seedDefaults } from './seed'

let n = 0
const dbs: PlatitaDB[] = []
function freshDb(): PlatitaDB {
  const db = new PlatitaDB(`test-${n++}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

describe('seedDefaults', () => {
  it('seeds opening balance 23084 cents and Lima timezone', async () => {
    const db = freshDb()
    await seedDefaults(db)
    expect(await getOpeningBalanceCents(db)).toBe(23084)
    expect(await getTimezone(db)).toBe('America/Lima')
  })

  it('is idempotent and never overwrites existing values', async () => {
    const db = freshDb()
    await seedDefaults(db)
    await db.settings.put({ key: 'timezone', value: 'America/Bogota' })
    await seedDefaults(db)
    await seedDefaults(db)
    expect(await db.settings.count()).toBe(3)
    expect(await getTimezone(db)).toBe('America/Bogota')
  })

  it('fails closed when the opening balance is corrupt', async () => {
    const db = freshDb()
    await db.settings.put({ key: 'openingBalanceCents', value: 230.84 })
    await expect(getOpeningBalanceCents(db)).rejects.toThrow()
  })
})
