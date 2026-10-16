// PIN lock (spec §4 "PIN lock mechanics"). Pure + Web Crypto; no storage here.
// The PIN is only ever kept as a salted PBKDF2 hash. Everything fails closed.

export const PIN_LENGTH = 4
export const RELOCK_MS = 60_000 // spec decision 6: re-lock after 60 s in the background
export const FREE_ATTEMPTS = 5
const BASE_WAIT_MS = 30_000
const MAX_WAIT_MS = 15 * 60_000
const ITERATIONS = 150_000

export interface PinRecord {
  salt: string // base64
  hash: string // base64
  iterations: number
}

export function isValidPin(pin: string): boolean {
  return /^\d+$/.test(pin) && pin.length === PIN_LENGTH
}

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64)
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256)
  return new Uint8Array(bits)
}

export async function createPinRecord(pin: string, iterations = ITERATIONS): Promise<PinRecord> {
  if (!isValidPin(pin)) throw new Error(`PIN must be exactly ${PIN_LENGTH} digits`)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { salt: toB64(salt), hash: toB64(await derive(pin, salt, iterations)), iterations }
}

// Constant-time comparison; a malformed PIN or record is a plain "no".
export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  if (!isValidPin(pin)) return false
  try {
    const expected = fromB64(record.hash)
    const actual = await derive(pin, fromB64(record.salt), record.iterations)
    if (expected.length !== actual.length) return false
    let diff = 0
    for (let i = 0; i < actual.length; i++) diff |= expected[i] ^ actual[i]
    return diff === 0
  } catch {
    return false
  }
}

// null = missing OR corrupt. Callers must treat null as "locked, cannot verify", never as "no PIN".
export function parsePinRecord(raw: string | number | undefined): PinRecord | null {
  if (typeof raw !== 'string') return null
  try {
    const r = JSON.parse(raw) as Partial<PinRecord>
    if (typeof r.salt !== 'string' || typeof r.hash !== 'string') return null
    if (!Number.isInteger(r.iterations) || (r.iterations as number) < 1) return null
    return { salt: r.salt, hash: r.hash, iterations: r.iterations as number }
  } catch {
    return null
  }
}

// Wait imposed right after the `failures`-th consecutive failure: none for the first 4,
// then 30 s at 5, 60 s at 10, 120 s at 15 … capped at 15 min.
export function lockoutMs(failures: number): number {
  if (failures < FREE_ATTEMPTS || failures % FREE_ATTEMPTS !== 0) return 0
  const level = failures / FREE_ATTEMPTS - 1
  return Math.min(BASE_WAIT_MS * 2 ** level, MAX_WAIT_MS)
}

// A clock that moved backwards while the app was away also re-locks (fail closed).
export function shouldRelock(hiddenAtMs: number, nowMs: number): boolean {
  const away = nowMs - hiddenAtMs
  return away < 0 || away >= RELOCK_MS
}
