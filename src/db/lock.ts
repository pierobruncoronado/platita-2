import { createPinRecord, isValidPin, lockoutMs, parsePinRecord, verifyPin, type PinRecord } from '../domain/pin'
import type { PlatitaDB, SettingKey } from './db'

async function num(db: PlatitaDB, key: SettingKey): Promise<number> {
  const row = await db.settings.get(key)
  return typeof row?.value === 'number' && Number.isFinite(row.value) ? row.value : 0
}

// 'none' = first launch (mandatory setup). 'corrupt' = a record exists but cannot be read:
// the app stays locked and only "Olvidé mi PIN" can proceed (fail closed, never "no PIN").
export type PinState = { kind: 'none' } | { kind: 'set'; record: PinRecord } | { kind: 'corrupt' }

export async function getPinState(db: PlatitaDB): Promise<PinState> {
  const row = await db.settings.get('pinRecord')
  if (!row) return { kind: 'none' }
  const record = parsePinRecord(row.value)
  return record ? { kind: 'set', record } : { kind: 'corrupt' }
}

export async function setPin(db: PlatitaDB, pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error('invalid PIN')
  const record = await createPinRecord(pin)
  await db.transaction('rw', db.settings, async () => {
    await db.settings.put({ key: 'pinRecord', value: JSON.stringify(record) })
    await db.settings.put({ key: 'pinFailures', value: 0 })
    await db.settings.put({ key: 'pinLockedUntil', value: 0 })
  })
}

export type UnlockResult = { ok: true } | { ok: false; reason: 'wrong' | 'waiting' | 'unreadable'; waitMs: number; failures: number }

// Attempts run one at a time: two concurrent tries would read the same failure counter and
// under-count, letting rapid taps slip past the wait.
let queue: Promise<unknown> = Promise.resolve()

// One attempt. The wait is persisted, so closing and reopening the app does not skip it.
export function tryUnlock(db: PlatitaDB, pin: string, nowMs: number): Promise<UnlockResult> {
  const run = queue.then(() => attempt(db, pin, nowMs))
  queue = run.catch(() => undefined)
  return run
}

async function attempt(db: PlatitaDB, pin: string, nowMs: number): Promise<UnlockResult> {
  const lockedUntil = await num(db, 'pinLockedUntil')
  const failures = await num(db, 'pinFailures')
  if (lockedUntil > nowMs) return { ok: false, reason: 'waiting', waitMs: lockedUntil - nowMs, failures }
  const state = await getPinState(db)
  if (state.kind !== 'set') return { ok: false, reason: 'unreadable', waitMs: 0, failures }
  if (await verifyPin(pin, state.record)) {
    await db.transaction('rw', db.settings, async () => {
      await db.settings.put({ key: 'pinFailures', value: 0 })
      await db.settings.put({ key: 'pinLockedUntil', value: 0 })
    })
    return { ok: true }
  }
  const next = failures + 1
  const wait = lockoutMs(next)
  await db.transaction('rw', db.settings, async () => {
    await db.settings.put({ key: 'pinFailures', value: next })
    await db.settings.put({ key: 'pinLockedUntil', value: wait > 0 ? nowMs + wait : 0 })
  })
  return { ok: false, reason: 'wrong', waitMs: wait, failures: next }
}

// "Olvidé mi PIN": removes only the lock (PIN, counters, biometric). Movements/closes are untouched.
export async function clearPin(db: PlatitaDB): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    for (const key of ['pinRecord', 'pinFailures', 'pinLockedUntil', 'biometricId', 'biometricSpike'] as SettingKey[]) {
      await db.settings.delete(key)
    }
  })
}

export async function getLockedUntil(db: PlatitaDB): Promise<number> {
  return num(db, 'pinLockedUntil')
}

export async function getBiometric(db: PlatitaDB): Promise<{ id: string | null; spike: string | null }> {
  const [id, spike] = await Promise.all([db.settings.get('biometricId'), db.settings.get('biometricSpike')])
  return { id: typeof id?.value === 'string' ? id.value : null, spike: typeof spike?.value === 'string' ? spike.value : null }
}

export async function saveBiometric(db: PlatitaDB, id: string | null, spike: string): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    if (id) await db.settings.put({ key: 'biometricId', value: id })
    else await db.settings.delete('biometricId')
    await db.settings.put({ key: 'biometricSpike', value: spike })
  })
}
