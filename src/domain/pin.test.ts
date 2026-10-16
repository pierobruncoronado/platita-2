import { describe, expect, it } from 'vitest'
import { createPinRecord, isValidPin, lockoutMs, parsePinRecord, shouldRelock, verifyPin } from './pin'

describe('isValidPin', () => {
  it('accepts exactly 4 digits and nothing else', () => {
    expect(isValidPin('0420')).toBe(true)
    for (const bad of ['', '123', '12345', '12a4', ' 123', '１２３４', '12.4']) expect(isValidPin(bad)).toBe(false)
  })
})

describe('createPinRecord / verifyPin', () => {
  it('verifies the right PIN and rejects a wrong one, never storing the PIN', async () => {
    const record = await createPinRecord('4821', 1000)
    expect(JSON.stringify(record)).not.toContain('4821')
    expect(await verifyPin('4821', record)).toBe(true)
    expect(await verifyPin('4822', record)).toBe(false)
  })

  it('salts: the same PIN gives different records', async () => {
    const a = await createPinRecord('1111', 1000)
    const b = await createPinRecord('1111', 1000)
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })

  it('fails closed on a malformed PIN or a damaged record', async () => {
    const record = await createPinRecord('1234', 1000)
    expect(await verifyPin('', record)).toBe(false)
    expect(await verifyPin('12', record)).toBe(false)
    expect(await verifyPin('1234', { ...record, hash: '' })).toBe(false)
    expect(await verifyPin('1234', { ...record, salt: '***not-base64***' })).toBe(false)
  })

  it('refuses to create a record for an invalid PIN', async () => {
    await expect(createPinRecord('12')).rejects.toThrow()
  })
})

describe('parsePinRecord', () => {
  it('returns null for anything unreadable (callers treat it as locked, not as "no PIN")', () => {
    for (const bad of [undefined, 5, '', '{', '{}', '{"salt":"a","hash":"b"}', '{"salt":"a","hash":"b","iterations":0}']) {
      expect(parsePinRecord(bad as string | number | undefined)).toBeNull()
    }
    expect(parsePinRecord('{"salt":"a","hash":"b","iterations":10}')).toEqual({ salt: 'a', hash: 'b', iterations: 10 })
  })
})

describe('lockoutMs', () => {
  it('is free for 4 failures, then 30 s at 5, doubling every further 5, capped at 15 min', () => {
    expect([1, 2, 3, 4].map(lockoutMs)).toEqual([0, 0, 0, 0])
    expect(lockoutMs(5)).toBe(30_000)
    expect([6, 7, 8, 9].map(lockoutMs)).toEqual([0, 0, 0, 0])
    expect(lockoutMs(10)).toBe(60_000)
    expect(lockoutMs(15)).toBe(120_000)
    expect(lockoutMs(50)).toBe(900_000)
    expect(lockoutMs(500)).toBe(900_000)
  })
})

describe('shouldRelock', () => {
  it('re-locks from 60 s in the background (spec decision 6)', () => {
    expect(shouldRelock(1_000, 60_999)).toBe(false)
    expect(shouldRelock(1_000, 61_000)).toBe(true)
    expect(shouldRelock(1_000, 91_000)).toBe(true) // AC8: 90 s away
    expect(shouldRelock(91_000, 1_000)).toBe(true) // clock moved back: do not trust it
  })
})
