import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/db'
import { createExpense } from '../db/movements'
import { getTileAmounts } from '../db/tiles'
import { categoryById, type QuickTile } from '../domain/catalog'
import { dayHeader, timeLabel, weekHeader } from '../domain/labels'
import { dayRange } from '../domain/ledger'
import { formatSolesShort, formatUsd } from '../domain/money'
import { toMs } from '../domain/time'
import { resolveTiles } from '../domain/tiles'
import type { AppSettings } from './App'
import { BottomNav } from './BottomNav'
import { ExportCard } from './ExportCard'
import { SecurityCard } from './SecurityCard'
import { FreeCard } from './FreeCard'
import { useNow } from './hooks'
import { Icon } from './icons'
import { Login } from './Login'
import type { ToastInput } from './UndoToast'
import { useLedger } from './useLedger'
import { useWeekView } from './useWeekView'

// Server movement kinds that need a readable name when there is no counterparty.
const KIND_LABEL: Record<string, string> = {
  refund: 'Devolución',
  atm_deposit: 'Depósito por cajero',
  atm_withdrawal: 'Retiro de cajero',
  yape_received: 'Yape recibido',
  yape_sent: 'Yape enviado',
  yape_payment: 'Pago con Yape',
  card_purchase: 'Compra con tarjeta',
}

export function Home({ settings, onCreated }: { settings: AppSettings; onCreated: (t: ToastInput) => void }) {
  const { tz } = settings
  const [now, refreshNow] = useNow()
  const view = useWeekView(settings, now)
  const ledger = useLedger(tz)
  // undefined = loading, null = unreadable: tiles stay disabled so a tap never books a wrong amount.
  const tileAmounts = useLiveQuery(() => getTileAmounts(db), [], undefined)
  const quickTiles = resolveTiles(tileAmounts ?? {})
  const [failed, setFailed] = useState(false)

  async function tapTile(tile: QuickTile) {
    try {
      const at = new Date().toISOString()
      const m = await createExpense(
        db,
        { amountCents: tile.amountCents, category: tile.category, subtype: tile.subtype, note: '', occurredAt: at },
        at,
        tz,
      )
      navigator.vibrate?.(15)
      refreshNow()
      setFailed(false)
      onCreated({ movementId: m.id, message: `${tile.label} ${formatSolesShort(tile.amountCents)} anotado`, undoTo: true })
    } catch (err) {
      console.error(JSON.stringify({ event: 'tile_create_failed', tile: tile.id, message: String(err) }))
      setFailed(true)
    }
  }

  // "Hoy" lists the owner's SERVER rows only; what is tapped in "Gasto rápido" is stored locally and never shown here.
  const today = (() => {
    if (ledger.kind !== 'ready') return []
    const { startMs, endMs } = dayRange(now, tz)
    return ledger.snapshot.movements
      .filter((m) => toMs(m.occurredAt) >= startMs && toMs(m.occurredAt) < endMs)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  })()

  return (
    <main className="screen with-nav">
      <header className="top">
        <div>
          <p className="muted small">{dayHeader(now, tz)}</p>
          <h1 className="title">{weekHeader(now, tz)}</h1>
        </div>
        {view && view.streak.alive && (
          <span className="streak-chip" data-testid="streak-chip">
            <Icon name="flame" size={18} />
            <span>{view.streak.count === 1 ? '1 día' : `${view.streak.count} días`}</span>
          </span>
        )}
      </header>

      {ledger.kind === 'login' ? <Login /> : <FreeCard ledger={ledger} now={now} tz={tz} />}

      <section className="section" aria-labelledby="quick-title">
        <div className="section-head">
          <h2 id="quick-title" className="section-title">
            Gasto rápido
          </h2>
          <a href="#/tiles" className="link-edit">
            Editar
          </a>
        </div>
        <div className="tiles">
          {quickTiles.map((tile) => {
            const color = categoryById(tile.category)?.color
            return (
              <button key={tile.id} type="button" className="tile" disabled={!tileAmounts} onClick={() => tapTile(tile)}>
                <span className="tile-icon" style={{ color, background: `${color}33` }}>
                  <Icon name={tile.icon} size={18} />
                </span>
                <span className="tile-row">
                  <span className="tile-label">{tile.label}</span>
                  <span className="tile-amount">{formatSolesShort(tile.amountCents)}</span>
                </span>
              </button>
            )
          })}
          <a href="#/captura" className="tile tile-other">
            <span className="tile-icon tile-icon-other">
              <Icon name="plus" size={18} />
            </span>
            <span className="tile-label">Otro monto</span>
          </a>
        </div>
        {tileAmounts === null && <p className="error small">No se pudieron leer tus montos. Reabre la app.</p>}
        {failed && <p className="error small">No se pudo guardar. Intenta otra vez.</p>}
      </section>

      {view && (
        <section className="close-card" aria-label="Cierra el día" data-testid="close-card">
          <div className="row-main">
            <span className="row-title">{view.closedToday ? 'Día cerrado' : 'Cierra el día'}</span>
            <span className="close-sub">{view.closedToday ? 'Listo por hoy. Mañana, otro cierre.' : '¿Falta algo? 30 segundos'}</span>
          </div>
          {!view.closedToday && (
            <a href="#/cerrar" className="btn-amber">
              Cerrar
            </a>
          )}
        </section>
      )}

      <ExportCard settings={settings} now={now} reminder />

      <section className="section" aria-labelledby="today-title">
        <h2 id="today-title" className="section-title">
          Hoy
        </h2>
        {ledger.kind !== 'ready' ? (
          <p className="muted small empty">{ledger.kind === 'loading' ? 'Cargando…' : 'Inicia sesión para ver tus movimientos de hoy.'}</p>
        ) : today.length === 0 ? (
          <p className="muted small empty">Sin movimientos hoy.</p>
        ) : (
          <ul className="list" data-testid="today-list">
            {today.map((m, i) => {
              const isIncome = m.direction === 'in'
              const amount = m.currency === 'USD' ? formatUsd(m.amountCents) : formatSolesShort(m.amountCents)
              return (
                <li key={`${m.occurredAt}-${i}`}>
                  <div className="row">
                    <span className="dot" style={{ background: isIncome ? 'var(--green)' : 'var(--muted)' }} aria-hidden="true" />
                    <span className="row-main">
                      <span className="row-title">{m.counterparty || KIND_LABEL[m.kind] || 'Movimiento'}</span>
                      <span className="row-sub">{timeLabel(m.occurredAt, tz)}</span>
                    </span>
                    <span className={`row-amount ${isIncome ? 'income' : ''}`}>
                      {isIncome ? '+' : ''}
                      {amount}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <ExportCard settings={settings} now={now} />

      <SecurityCard />

      <BottomNav active="home" />
    </main>
  )
}
