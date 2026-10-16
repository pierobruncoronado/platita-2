import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { PlatitaDB } from './db'
import { clearPin, getBiometric, getPinState, saveBiometric, setPin, tryUnlock } from './lock'

let n = 0
const dbs: PlatitaDB[] = []
const freshDb = () => {
  const db = new PlatitaDB(`lock-${n++}`)
  dbs.push(db)
  return db
}
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

const T0 = 1_000_000

describe('PIN state', () => {
  it('is "none" on first launch and "set" after setPin, without ever storing the PIN', async () => {
    const db = freshDb()
    expect((await getPinState(db)).kind).toBe('none')
    await setPin(db, '4821')
    expect((await getPinState(db)).kind).toBe('set')
    expect(JSON.stringify(await db.settings.toArray())).not.toContain('4821')
  })

  it('a damaged record is "corrupt", not "none" (fail closed)', async () => {
    const db = freshDb()
    await db.settings.put({ key: 'pinRecord', value: '{broken' })
    expect((await getPinState(db)).kind).toBe('corrupt')
    expect(await tryUnlock(db, '1234', T0)).toMatchObject({ ok: false, reason: 'unreadable' })
  })
})

describe('tryUnlock', () => {
  it('opens with the right PIN and resets the counters', async () => {
    const db = freshDb()
    await setPin(db, '4821')
    expect(await tryUnlock(db, '0000', T0)).toMatchObject({ ok: false, reason: 'wrong', failures: 1 })
    expect(await tryUnlock(db, '4821', T0)).toEqual({ ok: true })
    expect(await tryUnlock(db, '0000', T0)).toMatchObject({ failures: 1 })
  })

  it('imposes a 30 s wait after 5 failures that survives "reopening" and rejects even the right PIN', async () => {
    const db = freshDb()
    await setPin(db, '4821')
    let last
    for (let i = 0; i < 5; i++) last = await tryUnlock(db, '0000', T0)
    expect(last).toMatchObject({ ok: false, reason: 'wrong', waitMs: 30_000, failures: 5 })
    // same data, a "new session" 10 s later: still waiting, the correct PIN does not help
    expect(await tryUnlock(db, '4821', T0 + 10_000)).toMatchObject({ ok: false, reason: 'waiting', waitMs: 20_000 })
    // after the wait the correct PIN works
    expect(await tryUnlock(db, '4821', T0 + 30_001)).toEqual({ ok: true })
  })

  it('doubles the wait at the 10th failure', async () => {
    const db = freshDb()
    await setPin(db, '4821')
    let t = T0
    for (let i = 0; i < 5; i++) await tryUnlock(db, '0000', t)
    t += 31_000
    let last
    for (let i = 0; i < 5; i++) last = await tryUnlock(db, '0000', t)
    expect(last).toMatchObject({ failures: 10, waitMs: 60_000 })
  })
})

describe('clearPin ("Olvidé mi PIN")', () => {
  it('removes the lock and biometric but never touches movements or closed days', async () => {
    const db = freshDb()
    await setPin(db, '4821')
    await saveBiometric(db, 'cred-id', 'ok')
    await db.movements.add({
      id: 'm1', type: 'expense', amountCents: 200, category: 'transporte', subtype: 'Pasaje', note: '', occurredAt: '2026-10-20T15:00:00.000Z',
      createdAt: '2026-10-20T15:00:00.000Z', weekId: '2026-W43', recurringId: null, source: null, status: 'confirmed', undone: false,
    })
    await db.closes.add({ day: '2026-10-20', closedAt: '2026-10-20T23:00:00.000Z' })
    await clearPin(db)
    expect((await getPinState(db)).kind).toBe('none')
    expect(await getBiometric(db)).toEqual({ id: null, spike: null })
    expect(await db.movements.count()).toBe(1)
    expect(await db.closes.count()).toBe(1)
  })
})

describe('biometric record', () => {
  it('stores the spike outcome even when no credential was created', async () => {
    const db = freshDb()
    await saveBiometric(db, null, 'failed:NotAllowedError')
    expect(await getBiometric(db)).toEqual({ id: null, spike: 'failed:NotAllowedError' })
  })
})

describe('concurrent attempts', () => {
  it('rapid parallel wrong PINs are counted one by one, so the 5th still triggers the wait', async () => {
    const db = freshDb()
    await setPin(db, '4821')
    const results = await Promise.all(Array.from({ length: 5 }, () => tryUnlock(db, '0000', T0)))
    expect(results.map((r) => (r.ok ? 0 : r.failures))).toEqual([1, 2, 3, 4, 5])
    expect(results[4]).toMatchObject({ waitMs: 30_000 })
    expect(await tryUnlock(db, '4821', T0 + 1)).toMatchObject({ ok: false, reason: 'waiting' })
  })
})
