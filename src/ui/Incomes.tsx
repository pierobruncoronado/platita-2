import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { INCOME_SOURCES, RECURRING_TEMPLATES } from '../domain/catalog'
import { generateExpected, openExpected } from '../domain/expected'
import { whenLabel } from '../domain/labels'
import { formatSolesShort } from '../domain/money'
import { weekIdOf } from '../domain/time'
import type { AppSettings } from './App'
import { BottomNav } from './BottomNav'
import { cadenceText, expectedSubtitle } from './expectedText'
import { navigate, useNow } from './hooks'

export function Incomes({ settings }: { settings: AppSettings }) {
  const { tz, opening } = settings
  const [now] = useNow()
  const movements = useLiveQuery(() => db.movements.toArray(), [])

  const week = weekIdOf(now, tz)
  const confirmed = (movements ?? [])
    .filter(
      (m) =>
        m.type === 'income' && m.status === 'confirmed' && !m.undone && m.occurredAt >= opening.at && weekIdOf(m.occurredAt, tz) === week,
    )
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const open = movements ? openExpected(generateExpected(RECURRING_TEMPLATES, now, tz), movements, now) : []

  return (
    <main className="screen with-nav">
      <header className="top">
        <h1 className="title">Ingresos</h1>
        <button type="button" className="btn-green" onClick={() => navigate({ name: 'income', id: null, expectedId: null })}>
          + Ingreso suelto
        </button>
      </header>

      <section className="section" aria-labelledby="conf-title">
        <h2 id="conf-title" className="eyebrow">
          Confirmados esta semana
        </h2>
        {confirmed.length === 0 ? (
          <p className="card-flat muted small">Nada confirmado todavía esta semana.</p>
        ) : (
          <ul className="list">
            {confirmed.map((m) => (
              <li key={m.id}>
                <button type="button" className="row" onClick={() => navigate({ name: 'income', id: m.id, expectedId: null })}>
                  <span className="row-main">
                    <span className="row-title">{m.source ?? 'Ingreso'}</span>
                    <span className="row-sub">
                      {m.note ? `${m.note} · ` : ''}
                      {whenLabel(m.occurredAt, now, tz)}
                    </span>
                  </span>
                  <span className="row-amount income">+{formatSolesShort(m.amountCents)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="exp-title">
        <h2 id="exp-title" className="eyebrow">
          Esperados
        </h2>
        {open.length === 0 && <p className="card-flat muted small">Nada pendiente por cobrar.</p>}
        {open.map(({ item, status }) => (
          <div key={item.id} className="expected-card">
            <div className="row-main">
              <span className="expected-title">
                {item.label}
                {status.state === 'overdue' && <span className="tag-overdue">atrasada</span>}
              </span>
              <span className="expected-sub">{expectedSubtitle(item, status)}</span>
            </div>
            <button type="button" className="btn-green" onClick={() => navigate({ name: 'income', id: null, expectedId: item.id })}>
              Confirmar
            </button>
          </div>
        ))}
      </section>

      <section className="section" aria-labelledby="rec-title">
        <h2 id="rec-title" className="eyebrow">
          Recurrentes
        </h2>
        <ul className="list">
          {RECURRING_TEMPLATES.map((t) => (
            <li key={t.id} className="static-row">
              <span className="row-main">
                <span className="row-title">{t.label}</span>
                <span className="row-sub">{cadenceText(t)}</span>
              </span>
              <span className="tag">Fijo</span>
            </li>
          ))}
          <li className="static-row">
            <span className="row-main">
              <span className="row-title">Sueltos</span>
              <span className="row-sub">{INCOME_SOURCES.join(', ')} · sin ciclo, solo al llegar</span>
            </span>
            <span className="tag">Suelto</span>
          </li>
        </ul>
      </section>

      <BottomNav active="incomes" />
    </main>
  )
}
