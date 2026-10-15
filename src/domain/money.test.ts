import { describe, expect, it } from 'vitest'
import { formatSoles, formatSolesShort } from './money'

describe('formatSoles', () => {
  it('formats the opening balance', () => {
    expect(formatSoles(23084)).toBe('S/230.84')
  })

  it('pads cents and handles zero', () => {
    expect(formatSoles(0)).toBe('S/0.00')
    expect(formatSoles(205)).toBe('S/2.05')
    expect(formatSoles(2500)).toBe('S/25.00')
  })

  it('formats negatives with a minus sign', () => {
    expect(formatSoles(-8700)).toBe('−S/87.00')
  })

  it('short form drops .00 only', () => {
    expect(formatSolesShort(200)).toBe('S/2')
    expect(formatSolesShort(750)).toBe('S/7.50')
    expect(formatSolesShort(-3400)).toBe('−S/34')
  })

  it('rejects non-integer cents', () => {
    expect(() => formatSoles(230.84)).toThrow()
  })
})
