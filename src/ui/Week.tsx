import { CATEGORIES } from '../domain/catalog'
import { weekHeader } from '../domain/labels'
import { formatSolesShort } from '../domain/money'
import { weekdayIndex } from '../domain/week'
import type { AppSettings } from './App'
import { BottomNav } from './BottomNav'
import { Donut } from './Donut'
import { useNow } from './hooks'
import { Icon } from './icons'
import { PeriodToggle } from './PeriodToggle'
import { useWeekView } from './useWeekView'

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const BAR_MAX_PX = 84
// Exact soles without "S/" (2.5, not 3): the bars must agree with the donut and the legend.
const sol = (cents: number) => String(Number((cents / 100).toFixed(2)))

export function Week({ settings }: { settings: AppSettings }) {
  const { tz } = settings
  const [now] = useNow()
  const view = useWeekView(settings, now)
  const todayIdx = weekdayIndex(now, tz)

  return (
    <main className="screen with-nav">
      <header className="top">
        <div>
          <p className="muted small">Semana calendario · lun–dom</p>
          <h1 className="title">{weekHeader(now, tz).replace('Semana ', '')}</h1>
        </div>
        <PeriodToggle active="week" />
      </header>

      {!view ? (
        <div aria-busy="true" />
      ) : (
        <>
          <DonutCard spend={view.spend} />
          <DaysCard days={view.days} todayIdx={todayIdx} />
          <ExpectedCard view={view} />
          <section className="sunday-card" aria-label="Cierre del domingo">
            <p className="eyebrow gold">Cierre del domingo → Ahorro</p>
            <div className="sunday-row">
              <p className="sunday-amount" data-testid="sunday-amount">
                {formatSolesShort(view.projection.projectedCents)}
              </p>
              <p className="sunday-formula">{formula(view.projection.owedCents, view.projection.weeklyNetCents)}</p>
            </div>
            <p className="sunday-note">
              {view.projection.owedCents > 0 ? 'Si llega todo lo esperado. ' : ''}
              Lo que sobre pasa solo a Ahorro (dom 23:59). Si queda negativo, se descuenta del Ahorro.
            </p>
          </section>
          <StreakCard view={view} />
        </>
      )}

      <BottomNav active="week" />
    </main>
  )
}

// "130 por llegar − 34 de la semana" (net so far can be positive or negative).
function formula(owedCents: number, netCents: number): string {
  const owed = `${formatSolesShort(owedCents)} por llegar`
  if (netCents === 0) return owed
  return `${owed} ${netCents < 0 ? '−' : '+'} ${formatSolesShort(Math.abs(netCents))} de la semana`
}

type View = NonNullable<ReturnType<typeof useWeekView>>

function DonutCard({ spend }: { spend: View['spend'] }) {
  const legend = CATEGORIES.filter((c) => c.id !== 'otros' || spend.byCategory.otros > 0)
  return (
    <section className="card stack" aria-labelledby="donut-title">
      <h2 id="donut-title" className="section-title">
        ¿En qué se fue?
      </h2>
      <div className="donut-row">
        <Donut
          slices={CATEGORIES.map((c) => ({ id: c.id, color: c.color, cents: spend.byCategory[c.id] }))}
          totalLabel={formatSolesShort(spend.hormigasCents)}
          caption="hormigas"
          testId="hormigas-total"
        />
        <ul className="legend">
          {legend.map((c) => (
            <li key={c.id} className={spend.byCategory[c.id] === 0 ? 'muted' : ''}>
              <span className="legend-name">
                <i className="dot" style={{ background: c.color }} />
                {c.label}
              </span>
              <b>{formatSolesShort(spend.byCategory[c.id])}</b>
            </li>
          ))}
        </ul>
      </div>
      <p className="muted small" data-testid="claude-note">
        {spend.claudeCents > 0
          ? `Claude ${formatSolesShort(spend.claudeCents)} va aparte (es mensual).`
          : 'Claude es mensual y va aparte (ver Ingresos).'}
      </p>
    </section>
  )
}

function DaysCard({ days, todayIdx }: { days: View['days']; todayIdx: number }) {
  const max = Math.max(...days.map((d) => d.hormigasCents), 1)
  return (
    <section className="card stack" aria-labelledby="days-title">
      <div className="card-head">
        <h2 id="days-title" className="section-title">
          Día a día
        </h2>
        <span className="muted small">solo hormigas</span>
      </div>
      <div className="days">
        {days.map((d) => {
          const future = d.day > todayIdx
          const today = d.day === todayIdx
          const height = (d.hormigasCents / max) * BAR_MAX_PX
          return (
            <div key={d.day} className={`day ${today ? 'day-today' : ''}`} data-testid={`day-${d.day}`}>
              <span className="day-val">{future ? '–' : sol(d.hormigasCents)}</span>
              {d.hormigasCents > 0 ? (
                <div className="day-bar" style={{ height: Math.max(height, 6) }}>
                  {CATEGORIES.map((c) =>
                    d.byCategory[c.id] > 0 ? <span key={c.id} style={{ flex: d.byCategory[c.id], background: c.color }} /> : null,
                  )}
                </div>
              ) : (
                <div className="day-empty" />
              )}
              <span className="day-name">{DAY_LABELS[d.day]}</span>
            </div>
          )
        })}
      </div>
      <p className="muted small">Sin tope fijo: cuenta lo que realmente gastes cada día.</p>
    </section>
  )
}

function ExpectedCard({ view }: { view: View }) {
  const { open, owedCents, incomeCents } = view
  return (
    <section className="card stack" aria-labelledby="exp-title">
      <h2 id="exp-title" className="section-title">
        Lo que falta por entrar
      </h2>
      {open.length === 0 ? (
        <p className="muted small">Nada pendiente por cobrar.</p>
      ) : (
        <>
          <div className="exp-bar" aria-hidden="true">
            {open.map(({ item, status }) => (
              <span key={item.id} className="bar-expected" style={{ flex: status.remainingCents }} />
            ))}
          </div>
          <ul className="exp-list">
            {open.map(({ item, status }) => (
              <li key={item.id}>
                <span>
                  {item.label}
                  {status.state === 'overdue' && <span className="tag-overdue">atrasada</span>}
                  {status.confirmedCents > 0 && (
                    <span className="muted exp-part">
                      {' '}
                      · faltan {formatSolesShort(status.remainingCents)} de {formatSolesShort(item.amountCents)}
                    </span>
                  )}
                </span>
                <b className="exp-amount">{formatSolesShort(status.remainingCents)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="exp-foot">
        <span className="muted">{formatSolesShort(incomeCents)} confirmado</span>
        <span className="exp-amount">{formatSolesShort(owedCents)} por llegar</span>
      </div>
    </section>
  )
}

function StreakCard({ view }: { view: View }) {
  const { streak, weekCloses } = view
  const title =
    weekCloses.closed === 1 ? `1 día cerrado de ${weekCloses.elapsed}` : `${weekCloses.closed} días cerrados de ${weekCloses.elapsed}`
  const sub = streak.alive
    ? 'Racha viva · se rompe si pasan 3 días sin cerrar'
    : streak.totalClosed > 0
      ? 'Racha en 0. Cierra hoy y empiezas otra.'
      : 'Cierra el día para empezar tu racha.'
  return (
    <section className="streak-card" aria-label="Racha" data-testid="streak-card">
      <span className="streak-icon">
        <Icon name="flame" size={22} />
      </span>
      <div className="row-main">
        <span className="row-title">{title}</span>
        <span className="row-sub streak-sub">{sub}</span>
      </div>
      {streak.level > 0 && <span className="tag" data-testid="level">Nivel {streak.level}</span>}
    </section>
  )
}
