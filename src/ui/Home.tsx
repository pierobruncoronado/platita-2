import { useState } from 'react'
import { db } from '../db/db'
import { createExpense } from '../db/movements'
import { categoryById, QUICK_TILES, type QuickTile } from '../domain/catalog'
import { dayHeader, isSameLocalDay, timeLabel, weekHeader } from '../domain/labels'
import { formatSolesShort } from '../domain/money'
import type { AppSettings } from './App'
import { BottomNav } from './BottomNav'
import { ExportCard } from './ExportCard'
import { SecurityCard } from './SecurityCard'
import { FreeCard } from './FreeCard'
import { shortLabel } from './expectedText'
import { navigate, useNow } from './hooks'
import { Icon } from './icons'
import type { ToastInput } from './UndoToast'
import { useWeekView } from './useWeekView'

export function Home({ settings, onCreated }: { settings: AppSettings; onCreated: (t: ToastInput) => void }) {
  const { tz, opening } = settings
  const [now, refreshNow] = useNow()
  const view = useWeekView(settings, now)
  const movements = view?.movements
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

  const open = view?.open ?? []
  const owedCents = view?.owedCents ?? 0
  const today = (movements ?? [])
    .filter((m) => m.status === 'confirmed' && !m.undone && m.occurredAt >= opening.at && isSameLocalDay(m.occurredAt, now, tz))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))

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

      <FreeCard view={view} />

      <section className="section" aria-labelledby="quick-title">
        <h2 id="quick-title" className="section-title">
          Gasto rápido
        </h2>
        <div className="tiles">
          {QUICK_TILES.map((tile) => {
            const color = categoryById(tile.category)?.color
            return (
              <button key={tile.id} type="button" className="tile" onClick={() => tapTile(tile)}>
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
        {failed && <p className="error small">No se pudo guardar. Intenta otra vez.</p>}
      </section>

      {owedCents > 0 && (
        <section className="owed-card" aria-label="Te deben">
          <div className="row-main">
            <span className="row-title">Te deben {formatSolesShort(owedCents)}</span>
            <span className="owed-sub">
              {open
                .map(({ item, status }) => `${shortLabel(item)} ${formatSolesShort(status.remainingCents)}${status.state === 'overdue' ? ' (atrasada)' : ''}`)
                .join(' + ')}
            </span>
          </div>
          <a href="#/ingresos" className="btn-green">
            Confirmar
          </a>
        </section>
      )}

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
        {today.length === 0 ? (
          <p className="muted small empty">Nada anotado hoy.</p>
        ) : (
          <ul className="list">
            {today.map((m) => {
              const cat = categoryById(m.category)
              const isIncome = m.type === 'income'
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className="row"
                    onClick={() =>
                      navigate(isIncome ? { name: 'income', id: m.id, expectedId: null } : { name: 'capture', id: m.id })
                    }
                  >
                    <span className="dot" style={{ background: isIncome ? 'var(--green)' : cat?.color }} aria-hidden="true" />
                    <span className="row-main">
                      <span className="row-title">{isIncome ? (m.source ?? 'Ingreso') : (m.subtype ?? cat?.label ?? 'Gasto')}</span>
                      <span className="row-sub">
                        {m.note ? `${m.note} · ` : ''}
                        {timeLabel(m.occurredAt, tz)}
                      </span>
                    </span>
                    <span className={`row-amount ${isIncome ? 'income' : ''}`}>
                      {isIncome ? '+' : ''}
                      {formatSolesShort(m.amountCents)}
                    </span>
                  </button>
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
