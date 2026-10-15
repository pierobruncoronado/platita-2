// Keypad input as a string ("12.5"), converted to integer cents only at save time.

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back'

const MAX_INTEGER_DIGITS = 5 // up to S/99999

export function pressKey(input: string, key: KeypadKey): string {
  if (key === 'back') return input.slice(0, -1)
  const [int, dec] = input.split('.')
  if (key === '.') {
    if (dec !== undefined) return input
    return input === '' ? '0.' : `${input}.`
  }
  if (dec !== undefined) return dec.length >= 2 ? input : input + key
  if (int === '0') return key // no leading zeros
  if (int.length >= MAX_INTEGER_DIGITS) return input
  return input + key
}

// null when blank or zero: Guardar must stay disabled (eval 10).
export function parseAmountCents(input: string): number | null {
  if (!/^\d+(\.\d{0,2})?$/.test(input)) return null
  const [int, dec = ''] = input.split('.')
  const cents = Number(int) * 100 + Number(dec.padEnd(2, '0'))
  return cents > 0 ? cents : null
}

export function centsToInput(cents: number): string {
  const soles = Math.floor(cents / 100)
  const rest = cents % 100
  return rest === 0 ? String(soles) : `${soles}.${String(rest).padStart(2, '0')}`
}
