// Spec §7 eval 11 (AC8) in plain language. Run on demand: npm run test:evals
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { shouldRelock } from '../domain/pin'
import { PlatitaDB } from './db'
import { clearPin, getPinState, setPin, tryUnlock } from './lock'

let n = 0
const dbs: PlatitaDB[] = []
const freshDb = () => {
  const db = new PlatitaDB(`lock-eval-${n++}`)
  dbs.push(db)
  return db
}
afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

const T0 = 5_000_000

describe('eval 11 (AC8): "dejé el teléfono un rato y alguien lo agarró"', () => {
  it('backgrounded 90 s → the PIN is asked again; 30 s → still open', () => {
    expect(shouldRelock(T0, T0 + 30_000)).toBe(false)
    expect(shouldRelock(T0, T0 + 90_000)).toBe(true)
  })

  it('someone guessing: 5 wrong PINs → 30 s wait, and even the right PIN is refused during it', async () => {
    const db = freshDb()
    await setPin(db, '4821')
    for (let i = 0; i < 5; i++) await tryUnlock(db, '1111', T0)
    expect(await tryUnlock(db, '4821', T0 + 5_000)).toMatchObject({ ok: false, reason: 'waiting' })
    expect(await tryUnlock(db, '4821', T0 + 31_000)).toEqual({ ok: true })
  })

  it('nothing opens by itself: a missing PIN row is a first launch (setup), a damaged one stays locked', async () => {
    const db = freshDb()
    expect((await getPinState(db)).kind).toBe('none')
    await db.settings.put({ key: 'pinRecord', value: 'garbage' })
    expect((await getPinState(db)).kind).toBe('corrupt')
    expect(await tryUnlock(db, '4821', T0)).toMatchObject({ ok: false })
  })

  it('"Olvidé mi PIN" removes only the lock: the week of spending is still there', async () => {
    const db = freshDb()
    await setPin(db, '4821')
    await db.movements.add({
      id: 'x', type: 'expense', amountCents: 700, category: 'comida', subtype: 'Snack', note: '', occurredAt: '2026-10-20T17:00:00.000Z',
      createdAt: '2026-10-20T17:00:00.000Z', weekId: '2026-W43', recurringId: null, source: null, status: 'confirmed', undone: false,
    })
    await clearPin(db)
    expect((await getPinState(db)).kind).toBe('none')
    expect((await db.movements.toArray()).map((m) => m.amountCents)).toEqual([700])
  })
})
