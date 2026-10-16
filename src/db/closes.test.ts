import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { closeToday } from './closes'
import { PlatitaDB } from './db'

let n = 0
const dbs: PlatitaDB[] = []
const freshDb = () => {
  const db = new PlatitaDB(`closes-${n++}`)
  dbs.push(db)
  return db
}
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

describe('closeToday', () => {
  it('stores the Lima civil day, not the UTC one', async () => {
    const db = freshDb()
    expect(await closeToday(db, '2026-10-22T04:30:00.000Z', 'America/Lima')).toBe('2026-10-21') // Lima 23:30
    expect(await db.closes.toArray()).toEqual([{ day: '2026-10-21', closedAt: '2026-10-22T04:30:00.000Z' }])
  })

  it('is idempotent: a second close the same day keeps the first one', async () => {
    const db = freshDb()
    await closeToday(db, '2026-10-22T15:00:00.000Z', 'America/Lima')
    await closeToday(db, '2026-10-22T20:00:00.000Z', 'America/Lima')
    const rows = await db.closes.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].closedAt).toBe('2026-10-22T15:00:00.000Z')
  })

  it('does not touch movements or settings', async () => {
    const db = freshDb()
    await closeToday(db, '2026-10-22T15:00:00.000Z', 'America/Lima')
    expect(await db.movements.count()).toBe(0)
    expect(await db.settings.count()).toBe(0)
  })
})
