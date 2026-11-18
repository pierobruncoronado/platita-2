import { useMemo } from 'react'
import { homeNumbers } from '../domain/ledger'
import { formatSoles, formatSolesShort, formatUsd } from '../domain/money'
import { freeTone } from '../domain/week'
import { Icon } from './icons'
import type { LedgerState } from './useLedger'

type Ready = Extract<LedgerState, { kind: 'ready' }>

function ageLabel(fetchedAt: string, now: string): string {
  const mins = Math.max(0, Math.round((Date.parse(now) - Date.parse(fetchedAt)) / 60_000))
  if (mins < 1) return 'hace un momento'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.round(mins / 60)
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.round(hours / 24)} d`
}

// Inicio's big card (board "Libre esta semana"). Numbers come ONLY from the owner's server rows
// (balance = last anchor + later movements; week/day flow); nothing typed on this phone is added.
export function FreeCard({ ledger, now, tz }: { ledger: LedgerState; now: string; tz: string }) {
  if (ledger.kind === 'loading') {
    return (
      <section className="card free-card" aria-busy="true">
        <p className="eyebrow">Libre esta semana</p>
        <p className="free-amount" data-testid="free">…</p>
      </section>
    )
  }
  if (ledger.kind === 'error') {
    return (
      <section className="card free-card">
        <p className="eyebrow">Libre esta semana</p>
        <p className="error small" role="alert">{ledger.message}</p>
      </section>
    )
  }
  if (ledger.kind === 'login') return null // Home shows <Login /> instead
  return <ReadyCard ledger={ledger} now={now} tz={tz} />
}

function ReadyCard({ ledger, now, tz }: { ledger: Ready; now: string; tz: string }) {
  const { snapshot, stale } = ledger
  const n = useMemo(() => homeNumbers(snapshot.anchors, snapshot.movements, now, tz), [snapshot, now, tz])
  const week = n.weekPen
  const net = week.netCents
  const spentCents = Math.max(0, week.outCents)
  const enteredCents = week.inCents
  const total = spentCents + enteredCents
  const pct = (cents: number) => `${(cents / total) * 100}%`
  return (
    <section className="card free-card" aria-live="polite">
      <p className="eyebrow">Libre esta semana</p>
      <div className="free-top">
        <p className={`free-amount tone-${freeTone(net)}`} data-testid="free">
          {formatSolesShort(net)}
        </p>
        <p className="muted small free-account">
          En cuenta{' '}
          <span data-testid="balance">{n.balancePenCents === null ? '—' : formatSoles(n.balancePenCents)}</span>
        </p>
      </div>
      <div className="week-bar" aria-hidden="true">
        {total > 0 && spentCents > 0 && <span style={{ width: pct(spentCents), background: 'var(--muted)' }} />}
        {total > 0 && enteredCents > 0 && <span style={{ width: pct(enteredCents), background: 'var(--green)' }} />}
      </div>
      <div className="week-legend">
        <span>
          <i className="swatch" style={{ background: 'var(--muted)' }} />
          Gastado {formatSolesShort(spentCents)}
        </span>
        <span>
          <i className="swatch" style={{ background: 'var(--green)' }} />
          Entró {formatSolesShort(enteredCents)}
        </span>
      </div>
      <p className="sunday-line" data-testid="spent-today">
        <Icon name="clock" size={18} />
        <span>Gastado hoy {formatSolesShort(Math.max(0, n.todayPen.outCents))}</span>
      </p>
      {n.balancePenCents === null && <p className="muted small">Falta una lectura de tu saldo para calcular “En cuenta”.</p>}
      {(n.weekUsd.outCents !== 0 || n.weekUsd.inCents !== 0) && (
        <p className="muted small" data-testid="usd-apart">
          Aparte, en dólares: salió {formatUsd(n.weekUsd.outCents)} esta semana
        </p>
      )}
      {stale && (
        <p className="muted small" data-testid="stale">
          Sin conexión · datos {ageLabel(snapshot.fetchedAt, now)}
        </p>
      )}
    </section>
  )
}
