// Money is always integer cents. Display only: "S/230.84".

export function formatSoles(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`formatSoles expects integer cents, got ${cents}`)
  }
  const sign = cents < 0 ? '−' : ''
  const abs = Math.abs(cents)
  const soles = Math.floor(abs / 100)
  const rest = abs % 100
  return `${sign}S/${soles}.${String(rest).padStart(2, '0')}`
}

// Dollars are never added to soles; a USD charge is shown apart: "US$23.60".
export function formatUsd(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`formatUsd expects integer cents, got ${cents}`)
  }
  const sign = cents < 0 ? '−' : ''
  const abs = Math.abs(cents)
  return `${sign}US$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

// Compact form for tiles and lists: "S/2", "S/7.50".
export function formatSolesShort(cents: number): string {
  const full = formatSoles(cents)
  return full.endsWith('.00') ? full.slice(0, -3) : full
}
