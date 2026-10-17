import { QUICK_TILES } from '../domain/catalog'
import { isValidTileAmount, parseTileAmounts, type TileAmounts } from '../domain/tiles'
import type { PlatitaDB } from './db'

// null = the read itself failed: callers must NOT fall back to the built-in amounts (an edited
// Taxi S/15 would silently book S/10 on a one-tap expense). A readable but damaged value is {}.
export async function getTileAmounts(db: PlatitaDB): Promise<TileAmounts | null> {
  try {
    return parseTileAmounts((await db.settings.get('tileAmounts'))?.value)
  } catch (err) {
    console.error(JSON.stringify({ event: 'tile_amounts_read_failed', message: String(err) }))
    return null
  }
}

async function write(db: PlatitaDB, change: (current: TileAmounts) => TileAmounts): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = parseTileAmounts((await db.settings.get('tileAmounts'))?.value)
    await db.settings.put({ key: 'tileAmounts', value: JSON.stringify(change(current)) })
  })
}

export async function setTileAmount(db: PlatitaDB, tileId: string, cents: number): Promise<void> {
  if (!QUICK_TILES.some((t) => t.id === tileId)) throw new Error(`unknown tile: ${tileId}`)
  if (!isValidTileAmount(cents)) throw new Error('tile amount must be positive integer cents')
  await write(db, (current) => ({ ...current, [tileId]: cents }))
}

export async function resetTileAmount(db: PlatitaDB, tileId: string): Promise<void> {
  await write(db, (current) => {
    const rest = { ...current }
    delete rest[tileId]
    return rest
  })
}
