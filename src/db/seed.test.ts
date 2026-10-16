import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { PlatitaDB } from './db'
import { RECURRING_TEMPLATES } from '../domain/catalog'
import { confirmExpected, expectedStatus, generateExpected } from '../domain/expected'
import { balanceAt } from '../domain/flow'
import { getOpening, getOpeningBalanceCents, getTimezone, seedDefaults } from './seed'

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

  it('seeds the pre-opening Claude payment once; it leaves S/30 por cobrar and never moves the balance', async () => {
    const db = freshDb()
    await seedDefaults(db)
    await seedDefaults(db)
    const movements = await db.movements.toArray()
    expect(movements).toHaveLength(1)

    const now = '2026-10-15T22:30:00.000Z' // Thu 17:30 Lima
    const opening = await getOpening(db)
    expect(balanceAt(movements, now, 'America/Lima', opening).enCuentaCents).toBe(23084)

    const items = generateExpected(RECURRING_TEMPLATES, now, 'America/Lima')
    const claude = items.find((i) => i.id === 'reposicion-claude:2026-10')!
    expect(expectedStatus(claude, movements, now)).toEqual({ state: 'overdue', confirmedCents: 5000, remainingCents: 3000 })
  })

  it("Piero's real 2026-10-15: mesada S/100 + Claude S/50 → En cuenta S/380.84, both settled", async () => {
    const db = freshDb()
    await seedDefaults(db)
    const now = '2026-10-15T22:30:00.000Z'
    const tz = 'America/Lima'
    const items = generateExpected(RECURRING_TEMPLATES, now, tz)
    expect(items.map((i) => i.id)).toEqual(['mesada-papa:2026-W42', 'reposicion-claude:2026-10'])
    const [mesada, claude] = items
    const before = await db.movements.toArray()
    const paidMesada = confirmExpected(mesada, before, 10000, now, tz, 'm1')
    const paidClaude = confirmExpected(claude, before, 5000, now, tz, 'c1')
    const all = [...before, paidMesada, paidClaude]
    expect(balanceAt(all, now, tz, await getOpening(db)).enCuentaCents).toBe(38084)
    expect(expectedStatus(mesada, all, now).state).toBe('settled')
    expect(expectedStatus(claude, all, now)).toEqual({ state: 'settled', confirmedCents: 10000, remainingCents: 0 })
  })

  it('fails closed when the opening balance is corrupt', async () => {
    const db = freshDb()
    await db.settings.put({ key: 'openingBalanceCents', value: 230.84 })
    await expect(getOpeningBalanceCents(db)).rejects.toThrow()
  })
})
