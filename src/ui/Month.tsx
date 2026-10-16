import { useMemo } from 'react'
import { CATEGORIES, CLAUDE_COLOR } from '../domain/catalog'
import { monthTitle, shortDate, untilToday } from '../domain/labels'
import { formatSolesShort } from '../domain/money'
import { baselineProgress, BASELINE_WEEKS, monthOf, monthSummary } from '../domain/month'
import type { AppSettings } from './App'
import { BottomNav } from './BottomNav'
import { Donut } from './Donut'
import { ExportCard } from './ExportCard'
import { useNow } from './hooks'
import { PeriodToggle } from './PeriodToggle'
import { useWeekView } from './useWeekView'

export function Month({ settings }: { settings: AppSettings }) {
  const { tz, opening } = settings
  const [now] = useNow()
  const view = useWeekView(settings, now)
  const data = useMemo(() => {
    if (!view) return null
    return {
      summary: monthSummary(view.movements, view.open, monthOf(now, tz), now, tz, opening),
      baseline: baselineProgress(view.movements, now, tz, opening),
    }
  }, [view, now, tz, opening])

  return (
    <main className="screen with-nav">
      <header className="top">
        <div>
          <p className="muted small">{untilToday(now, tz)}</p>
          <h1 className="title">{monthTitle(now, tz)}</h1>
        </div>
        <PeriodToggle active="month" />
      </header>

      {data && (
        <>
          <QuedoCard summary={data.summary} />
          <DonutCard summary={data.summary} />
          <WeeksCard summary={data.summary} />
          <BaselineCard baseline={data.baseline} />
        </>
      )}

      <ExportCard settings={settings} now={now} />
      <BottomNav active="month" />
    </main>
  )
}

type Summary = ReturnType<typeof monthSummary>

function QuedoCard({ summary }: { summary: Summary }) {
  const { incomeCents, spentCents, teQuedoCents } = summary
  const base = Math.max(incomeCents, spentCents)
  const pct = (cents: number) => `${(Math.max(cents, 0) / base) * 100}%`
  return (
    <section className="card free-card" aria-label="Te quedó">
      <p className="eyebrow">Te quedó</p>
      <div className="free-top">
        <p className="free-amount quedo-amount" data-testid="te-quedo">
          {formatSolesShort(teQuedoCents)}
        </p>
        <p className="muted small free-account">
          {formatSolesShort(incomeCents)} entró · {formatSolesShort(spentCents)} salió
        </p>
      </div>
      <div className="week-bar" aria-hidden="true">
        {base > 0 && (
          <>
            <span style={{ width: pct(spentCents), background: '#5b6b85' }} />
            {teQuedoCents > 0 && <span style={{ width: pct(teQuedoCents), background: 'var(--gold)' }} />}
          </>
        )}
      </div>
      <p className="quedo-note">Suma de los sobrantes de cada domingo. Lo cerrado ya está en tu Ahorro; la semana en curso cuenta parcial.</p>
    </section>
  )
}

function DonutCard({ summary }: { summary: Summary }) {
  const rows = [
    ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, color: c.color, cents: summary.byCategory[c.id] })),
    { id: 'claude', label: 'Claude', color: CLAUDE_COLOR, cents: summary.claudeCents },
  ].filter((r) => r.cents > 0 || ['transporte', 'comida', 'bebidas', 'alcohol'].includes(r.id))
  return (
    <section className="card stack" aria-labelledby="mdonut-title">
      <h2 id="mdonut-title" className="section-title">
        ¿En qué se fue el mes?
      </h2>
      <div className="donut-row">
        <Donut slices={rows} totalLabel={formatSolesShort(summary.spentCents)} caption="gastado" testId="month-total" />
        <ul className="legend">
          {rows.map((r) => (
            <li key={r.id} className={r.cents === 0 ? 'muted' : ''}>
              <span className="legend-name">
                <i className="dot" style={{ background: r.color }} />
                {r.label}
              </span>
              <b>{formatSolesShort(r.cents)}</b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function WeeksCard({ summary }: { summary: Summary }) {
  const max = Math.max(...summary.weeks.map((w) => Math.max(w.incomeCents + w.expectedCents, w.spentCents)), 1)
  const pctN = (cents: number) => Math.min((cents / max) * 100, 100)
  const pct = (cents: number) => `${pctN(cents)}%`
  return (
    <section className="card stack" aria-labelledby="weeks-title">
      <h2 id="weeks-title" className="section-title">
        Entró vs. salió por semana
      </h2>
      {summary.weeks.length === 0 ? (
        <p className="muted small">Todavía no hay semanas este mes.</p>
      ) : (
        <div className="weeks">
          {summary.weeks.map((w) => (
            <div key={w.weekId} className="week-row" data-testid={`mw-${w.weekId}`}>
              <span className="week-label">{shortDate(w.monday)}</span>
              <div className="week-tracks">
                {w.incomeCents > 0 && <div className="track track-in" style={{ width: pct(w.incomeCents) }} />}
                {w.spentCents > 0 && <div className="track" style={{ width: pct(w.spentCents), background: CLAUDE_COLOR }} />}
                {w.expectedCents > 0 && (
                  <div
                    className="track bar-expected"
                    style={{ width: `${Math.min(pctN(w.expectedCents), 100 - pctN(w.incomeCents))}%`, marginLeft: pct(w.incomeCents) }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="week-legend week-legend-left">
        <span>
          <i className="swatch" style={{ background: 'var(--green)' }} />
          Entró
        </span>
        <span>
          <i className="swatch" style={{ background: CLAUDE_COLOR }} />
          Salió
        </span>
        <span>
          <i className="swatch swatch-expected" />
          Esperado
        </span>
      </div>
    </section>
  )
}

function BaselineCard({ baseline }: { baseline: ReturnType<typeof baselineProgress> }) {
  return (
    <section className="card stack" aria-labelledby="base-title">
      <h2 id="base-title" className="section-title">
        Midiendo tu línea base
      </h2>
      <div className="base-segs" aria-hidden="true">
        {Array.from({ length: BASELINE_WEEKS }, (_, i) => (
          <span key={i} className={i < baseline.weeksDone ? 'on' : ''} />
        ))}
      </div>
      <p className="muted small" data-testid="baseline-text">
        {baseline.averageHormigasCents === null
          ? `${baseline.weeksDone} de ${BASELINE_WEEKS} semanas completas. Sin metas todavía: con ${BASELINE_WEEKS} semanas de datos verás tu promedio semanal de hormigas.`
          : `Línea base lista: en ${BASELINE_WEEKS} semanas gastaste en promedio ${formatSolesShort(baseline.averageHormigasCents)} por semana en hormigas. Las metas llegan después, desde este número.`}
      </p>
    </section>
  )
}
