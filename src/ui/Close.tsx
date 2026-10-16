import { useState } from 'react'
import { db } from '../db/db'
import { closeToday } from '../db/closes'
import { categoryById } from '../domain/catalog'
import { isSameLocalDay, timeLabel } from '../domain/labels'
import { formatSolesShort } from '../domain/money'
import type { AppSettings } from './App'
import { dayKey } from '../domain/streak'
import { navigate, replaceRoute, useNow } from './hooks'
import { Icon } from './icons'
import { useWeekView } from './useWeekView'

// "¿Falta algo?" (spec §4 daily close, ≤30 s): what was logged today, shortcuts to add what is
// missing, and one tap to close. Only today can be closed; nothing closes by itself.
export function Close({ settings }: { settings: AppSettings }) {
  const { tz, opening } = settings
  const [now, refreshNow] = useNow()
  const view = useWeekView(settings, now)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [newDay, setNewDay] = useState(false)

  const today = (view?.movements ?? [])
    .filter((m) => m.status === 'confirmed' && !m.undone && m.occurredAt >= opening.at && isSameLocalDay(m.occurredAt, now, tz))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))

  async function close() {
    setBusy(true)
    setFailed(false)
    try {
      const real = new Date().toISOString()
      // The list on screen is for the day it was opened; never close a day the user did not review.
      if (dayKey(real, tz) !== dayKey(now, tz)) {
        refreshNow()
        setNewDay(true)
        setBusy(false)
        return
      }
      await closeToday(db, real, tz)
      replaceRoute({ name: 'home' })
    } catch (err) {
      console.error(JSON.stringify({ event: 'close_day_failed', message: String(err) }))
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <main className="screen capture">
      <header className="capture-top">
        <button type="button" className="icon-btn" aria-label="Volver" onClick={() => replaceRoute({ name: 'home' })}>
          <Icon name="close" size={20} strokeWidth={2.2} />
        </button>
        <h1 className="capture-title">Cierra el día</h1>
        <span className="icon-spacer" aria-hidden="true" />
      </header>

      <section className="section" aria-labelledby="falta-title">
        <h2 id="falta-title" className="section-title">
          ¿Falta algo?
        </h2>
        {today.length === 0 ? (
          <p className="card-flat muted small">Hoy no anotaste nada. Puedes cerrar igual.</p>
        ) : (
          <ul className="list" data-testid="close-list">
            {today.map((m) => {
              const isIncome = m.type === 'income'
              const cat = categoryById(m.category)
              return (
                <li key={m.id} className="static-row">
                  <span className="dot" style={{ background: isIncome ? 'var(--green)' : cat?.color }} aria-hidden="true" />
                  <span className="row-main">
                    <span className="row-title">{isIncome ? (m.source ?? 'Ingreso') : (m.subtype ?? cat?.label ?? 'Gasto')}</span>
                    <span className="row-sub">{timeLabel(m.occurredAt, tz)}</span>
                  </span>
                  <span className={`row-amount ${isIncome ? 'income' : ''}`}>
                    {isIncome ? '+' : ''}
                    {formatSolesShort(m.amountCents)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="close-actions">
        <button type="button" className="btn-outline" onClick={() => navigate({ name: 'capture', id: null })}>
          Anotar un gasto
        </button>
        <button type="button" className="btn-outline" onClick={() => navigate({ name: 'incomes' })}>
          Confirmar un ingreso
        </button>
      </div>

      {newDay && <p className="muted small">Pasó la medianoche: revisa lo de hoy y vuelve a cerrar.</p>}
      {failed && <p className="error small">No se pudo cerrar el día. Intenta otra vez.</p>}
      <button type="button" className="save close-save" disabled={busy || view?.closedToday === true} onClick={close}>
        {view?.closedToday ? 'Día cerrado' : 'Cerrar el día'}
      </button>
    </main>
  )
}
