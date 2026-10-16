import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../db/db'
import { createExpense } from '../db/movements'
import { categoryById, QUICK_TILES, RECURRING_TEMPLATES, type QuickTile } from '../domain/catalog'
import { generateExpected, openExpected } from '../domain/expected'
import { balanceAt } from '../domain/flow'
import { dayHeader, isSameLocalDay, timeLabel, weekHeader } from '../domain/labels'
import { formatSoles, formatSolesShort } from '../domain/money'
import type { AppSettings } from './App'
import { BottomNav } from './BottomNav'
import { shortLabel } from './expectedText'
import { navigate, useNow } from './hooks'
import { Icon } from './icons'
import type { ToastInput } from './UndoToast'

export function Home({ settings, onCreated }: { settings: AppSettings; onCreated: (t: ToastInput) => void }) {
  const { tz, opening } = settings
  const [now, refreshNow] = useNow()
  const movements = useLiveQuery(() => db.movements.toArray(), [])
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

  const balance = useMemo(() => (movements ? balanceAt(movements, now, tz, opening) : null), [movements, now, tz, opening])
  const open = useMemo(
    () => (movements ? openExpected(generateExpected(RECURRING_TEMPLATES, now, tz), movements, now) : []),
    [movements, now, tz],
  )
  const owedCents = open.reduce((sum, x) => sum + x.status.remainingCents, 0)
  // "Si llega lo esperado" = En cuenta + everything still por cobrar (same definition as ifExpectedArrives).
  const ifArrives = balance ? balance.enCuentaCents + owedCents : null
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
      </header>

      <section className="card balance-card" aria-live="polite">
        <p className="eyebrow">En cuenta</p>
        <p className="balance" data-testid="balance">
          {balance ? formatSoles(balance.enCuentaCents) : '…'}
        </p>
        {balance && (
          <p className="muted small">
            Esta semana {balance.weeklyNetCents > 0 ? '+' : ''}
            {formatSolesShort(balance.weeklyNetCents)}
          </p>
        )}
        {ifArrives !== null && owedCents > 0 && (
          <p className="if-arrives small" data-testid="if-arrives">
            Si llega lo esperado {formatSoles(ifArrives)}
          </p>
        )}
      </section>

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

      <BottomNav active="home" />
    </main>
  )
}
