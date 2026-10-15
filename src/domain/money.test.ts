import { describe, expect, it } from 'vitest'
import { formatSoles } from './money'

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

  it('rejects non-integer cents', () => {
    expect(() => formatSoles(230.84)).toThrow()
  })
})
