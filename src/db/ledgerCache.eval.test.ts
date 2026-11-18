// H3 behavior evals: the offline cache and the "Gasto rápido stays out of the real numbers" rule.
// Run on demand: npm run test:evals. Synthetic amounts only.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type { LedgerSnapshot } from '../data/ledgerRead'
import { homeNumbers } from '../domain/ledger'
import { PlatitaDB } from './db'
import { loadSnapshot, saveSnapshot } from './ledgerCache'
import { createExpense } from './movements'

const TZ = 'America/Lima'
const NOW = '2026-11-17T15:30:00.000Z' // Tue 17 Nov 10:30 Lima

const SNAPSHOT: LedgerSnapshot = {
  fetchedAt: NOW,
  anchors: [{ id: 1, at: '2026-11-10T12:00:00.000Z', amountCents: 10_000, currency: 'PEN' }],
  movements: [
    { occurredAt: '2026-11-11T15:00:00.000Z', direction: 'out', amountCents: 2_000, currency: 'PEN', kind: 'card_purchase', counterparty: 'TIENDA A' },
    { occurredAt: '2026-11-17T15:00:00.000Z', direction: 'out', amountCents: 850, currency: 'PEN', kind: 'yape_sent', counterparty: null },
  ],
}

let n = 0
const dbs: PlatitaDB[] = []
function freshDb(): PlatitaDB {
  const db = new PlatitaDB(`ledger-eval-${n++}`)
  dbs.push(db)
  return db
}
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

describe('Eval: lo que anoto con "Gasto rápido" no entra al saldo ni al gasto de hoy', () => {
  it('a local tile expense sits in the same database as the cached server rows and changes nothing', async () => {
    const db = freshDb()
    await saveSnapshot(db, SNAPSHOT)
    const before = homeNumbers(SNAPSHOT.anchors, SNAPSHOT.movements, NOW, TZ)

    // Piero taps "Snack S/7" at 10:25 Lima: stored locally (v1 movements store).
    await createExpense(db, { amountCents: 700, category: 'comida', subtype: 'Snack', note: '', occurredAt: '2026-11-17T15:25:00.000Z' }, NOW, TZ)
    expect(await db.movements.count()).toBe(1)

    // What Inicio computes is built from the cached/server snapshot only.
    const cached = await loadSnapshot(db)
    expect(cached).not.toBeNull()
    const after = homeNumbers(cached!.anchors, cached!.movements, NOW, TZ)
    expect(after).toEqual(before)
    expect(after.balancePenCents).toBe(10_000 - 2_000 - 850)
    expect(after.todayPen.outCents).toBe(850) // not 1,550
  })
})

describe('Eval: sin internet abre con el último dato', () => {
  it('the last good read comes back intact from the device cache, with the same numbers', async () => {
    const db = freshDb()
    await saveSnapshot(db, SNAPSHOT)
    const cached = await loadSnapshot(db)
    expect(cached).toEqual(SNAPSHOT)
    expect(homeNumbers(cached!.anchors, cached!.movements, NOW, TZ)).toEqual(homeNumbers(SNAPSHOT.anchors, SNAPSHOT.movements, NOW, TZ))
  })

  it('a newer read replaces the previous one; an empty cache or a damaged one shows nothing, never wrong numbers', async () => {
    const db = freshDb()
    expect(await loadSnapshot(db)).toBeNull()
    await saveSnapshot(db, SNAPSHOT)
    const newer: LedgerSnapshot = { ...SNAPSHOT, fetchedAt: '2026-11-17T16:00:00.000Z', movements: [] }
    await saveSnapshot(db, newer)
    expect((await loadSnapshot(db))?.movements).toHaveLength(0)

    await db.ledgerCache.put({ key: 'last', value: '{not json' })
    expect(await loadSnapshot(db)).toBeNull()
    await db.ledgerCache.put({
      key: 'last',
      value: JSON.stringify({ fetchedAt: NOW, anchors: [], movements: [{ occurredAt: NOW, direction: 'out', amountCents: 8.5, currency: 'PEN', kind: 'x' }] }),
    })
    expect(await loadSnapshot(db)).toBeNull()
  })
})
