import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/db'
import { getTileAmounts, resetTileAmount, setTileAmount } from '../db/tiles'
import { categoryById, QUICK_TILES, type QuickTile } from '../domain/catalog'
import { centsToInput } from '../domain/amount'
import { formatSolesShort } from '../domain/money'
import { isValidTileAmount, resolveTiles } from '../domain/tiles'
import { AmountDisplay, Keypad, useAmountInput } from './form'
import { replaceRoute } from './hooks'
import { Icon } from './icons'

// "Editar" (spec §4 "Quick tile amounts"): change ONLY the default amount of each tile.
export function EditTiles() {
  const amounts = useLiveQuery(() => getTileAmounts(db), [], undefined)
  const [editing, setEditing] = useState<QuickTile | null>(null)

  if (amounts === undefined) return <main className="screen capture" aria-busy="true" />
  if (amounts === null) {
    return (
      <main className="screen capture">
        <p className="error">No se pudieron leer tus montos. Reabre la app.</p>
      </main>
    )
  }
  const tiles = resolveTiles(amounts)

  if (editing) {
    const current = tiles.find((t) => t.id === editing.id) ?? editing
    return <TileEditor key={editing.id} tile={current} edited={amounts[editing.id] !== undefined} onDone={() => setEditing(null)} />
  }

  return (
    <main className="screen capture">
      <header className="capture-top">
        <button type="button" className="icon-btn" aria-label="Volver" onClick={() => replaceRoute({ name: 'home' })}>
          <Icon name="close" size={20} strokeWidth={2.2} />
        </button>
        <h1 className="capture-title">Montos de Gasto rápido</h1>
        <span className="icon-spacer" aria-hidden="true" />
      </header>
      <p className="muted small">Toca una tecla para cambiar cuánto registra con 1 toque. Los gastos ya anotados no cambian.</p>
      <ul className="list" data-testid="tile-list">
        {tiles.map((tile) => {
          const color = categoryById(tile.category)?.color
          const base = QUICK_TILES.find((t) => t.id === tile.id)?.amountCents
          return (
            <li key={tile.id}>
              <button type="button" className="row" onClick={() => setEditing(tile)} data-testid={`tile-${tile.id}`}>
                <span className="tile-icon" style={{ color, background: `${color}33` }}>
                  <Icon name={tile.icon} size={18} />
                </span>
                <span className="row-main">
                  <span className="row-title">{tile.label}</span>
                  <span className="row-sub">{tile.amountCents === base ? 'Valor original' : `Original ${formatSolesShort(base ?? 0)}`}</span>
                </span>
                <span className="row-amount">{formatSolesShort(tile.amountCents)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </main>
  )
}

function TileEditor({ tile, edited, onDone }: { tile: QuickTile; edited: boolean; onDone: () => void }) {
  const base = QUICK_TILES.find((t) => t.id === tile.id)?.amountCents ?? tile.amountCents
  const amount = useAmountInput(centsToInput(tile.amountCents), true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = amount.cents !== null && isValidTileAmount(amount.cents)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onDone()
    } catch (err) {
      console.error(JSON.stringify({ event: 'tile_amount_save_failed', tile: tile.id, message: String(err) }))
      setError('No se pudo guardar. Intenta otra vez.')
      setBusy(false)
    }
  }

  // Typing the original amount again is the same as restoring it.
  const save = (cents: number) => (cents === base ? resetTileAmount(db, tile.id) : setTileAmount(db, tile.id, cents))

  return (
    <main className="screen capture" data-testid="tile-editor">
      <header className="capture-top">
        <button type="button" className="icon-btn" aria-label="Cancelar" onClick={onDone}>
          <Icon name="close" size={20} strokeWidth={2.2} />
        </button>
        <h1 className="capture-title">{tile.label}</h1>
        <span className="icon-spacer" aria-hidden="true" />
      </header>

      <AmountDisplay amount={amount.amount} fresh={amount.fresh} />
      {error && <p className="error small">{error}</p>}
      {edited && (
        <button type="button" className="btn-outline" disabled={busy} onClick={() => run(() => resetTileAmount(db, tile.id))}>
          Restaurar {formatSolesShort(base)}
        </button>
      )}
      <Keypad onKey={amount.tapKey} />
      <button
        type="button"
        className="save"
        disabled={!valid || busy}
        onClick={() => amount.cents !== null && run(() => save(amount.cents as number))}
      >
        Guardar
      </button>
    </main>
  )
}
