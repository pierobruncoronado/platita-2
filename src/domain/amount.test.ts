import { describe, expect, it } from 'vitest'
import { centsToInput, parseAmountCents, pressKey, type KeypadKey } from './amount'

function type(keys: string): string {
  return [...keys].reduce((acc, k) => pressKey(acc, (k === '<' ? 'back' : k) as KeypadKey), '')
}

describe('pressKey', () => {
  it('builds amounts and limits to 2 decimals', () => {
    expect(type('7')).toBe('7')
    expect(type('7.5')).toBe('7.5')
    expect(type('12.345')).toBe('12.34')
  })

  it('handles leading dot, double dot, leading zero and backspace', () => {
    expect(type('.5')).toBe('0.5')
    expect(type('1..2')).toBe('1.2')
    expect(type('007')).toBe('7')
    expect(type('25<')).toBe('2')
    expect(type('<')).toBe('')
  })

  it('caps the integer part at 5 digits', () => {
    expect(type('1234567')).toBe('12345')
  })
})

describe('parseAmountCents', () => {
  it('converts to integer cents', () => {
    expect(parseAmountCents('7')).toBe(700)
    expect(parseAmountCents('7.5')).toBe(750)
    expect(parseAmountCents('0.05')).toBe(5)
    expect(parseAmountCents('7.')).toBe(700)
  })

  it('returns null for blank or zero (Guardar disabled, eval 10)', () => {
    expect(parseAmountCents('')).toBeNull()
    expect(parseAmountCents('0')).toBeNull()
    expect(parseAmountCents('0.')).toBeNull()
    expect(parseAmountCents('0.00')).toBeNull()
  })
})

describe('centsToInput', () => {
  it('round-trips for the edit screen', () => {
    expect(centsToInput(700)).toBe('7')
    expect(centsToInput(750)).toBe('7.50')
    expect(parseAmountCents(centsToInput(750))).toBe(750)
  })
})
