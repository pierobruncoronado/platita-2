// Editable amounts of the quick tiles (spec §4 "Quick tile amounts"). Only the amount is editable.
import { QUICK_TILES, type QuickTile } from './catalog'

export const MAX_TILE_CENTS = 9_999_999 // S/99999.99, what the keypad can type

export function isValidTileAmount(cents: unknown): cents is number {
  return typeof cents === 'number' && Number.isInteger(cents) && cents > 0 && cents <= MAX_TILE_CENTS
}

export type TileAmounts = Record<string, number>

// Anything invalid (bad JSON, unknown tile, 0, negative, fractional, text) is dropped, so a damaged
// setting can never produce a wrong amount on a one-tap expense: the built-in default is used instead.
export function parseTileAmounts(raw: string | number | undefined): TileAmounts {
  if (typeof raw !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: TileAmounts = {}
    for (const tile of QUICK_TILES) {
      const value = (parsed as Record<string, unknown>)[tile.id]
      if (isValidTileAmount(value)) out[tile.id] = value
    }
    return out
  } catch {
    return {}
  }
}

export function resolveTiles(amounts: TileAmounts): QuickTile[] {
  return QUICK_TILES.map((t) => ({ ...t, amountCents: amounts[t.id] ?? t.amountCents }))
}
