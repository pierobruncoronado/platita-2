import { CATEGORIES } from '../domain/catalog'
import { formatSoles, formatSolesShort } from '../domain/money'
import { freeTone } from '../domain/week'
import { Icon } from './icons'
import type { useWeekView } from './useWeekView'

type WeekView = NonNullable<ReturnType<typeof useWeekView>>

// Inicio's big card (board "Libre esta semana"): weekly_net, En cuenta, the week bar and
// the Sunday projection. Amber below zero, green from zero; never guilt copy (spec §4).
export function FreeCard({ view }: { view: WeekView | null }) {
  if (!view) {
    return (
      <section className="card free-card" aria-busy="true">
        <p className="eyebrow">Libre esta semana</p>
        <p className="free-amount" data-testid="free">…</p>
      </section>
    )
  }
  const { balance, spend, incomeCents, owedCents, projection } = view
  const net = balance.weeklyNetCents
  // The bar shows everything spent (Claude included: it is part of weekly_net) in category colors.
  const spentCents = spend.hormigasCents + spend.claudeCents
  const total = spentCents + incomeCents + owedCents
  const pct = (cents: number) => `${(cents / total) * 100}%`
  return (
    <section className="card free-card" aria-live="polite">
      <p className="eyebrow">Libre esta semana</p>
      <div className="free-top">
        <p className={`free-amount tone-${freeTone(net)}`} data-testid="free">
          {formatSolesShort(net)}
        </p>
        <p className="muted small free-account">
          En cuenta <span data-testid="balance">{formatSoles(balance.enCuentaCents)}</span>
        </p>
      </div>
      <div className="week-bar" aria-hidden="true">
        {total > 0 &&
          CATEGORIES.map((c) => {
            const cents = spend.byCategory[c.id] + (c.id === 'otros' ? spend.claudeCents : 0)
            return cents > 0 ? <span key={c.id} style={{ width: pct(cents), background: c.color }} /> : null
          })}
        {total > 0 && incomeCents > 0 && <span style={{ width: pct(incomeCents), background: 'var(--green)' }} />}
        {total > 0 && owedCents > 0 && <span className="bar-expected" style={{ width: pct(owedCents) }} />}
      </div>
      <div className="week-legend">
        <span>
          <i className="swatch" style={{ background: 'var(--muted)' }} />
          Gastado {formatSolesShort(spentCents)}
        </span>
        <span>
          <i className="swatch swatch-expected" />
          Por llegar {formatSolesShort(owedCents)}
        </span>
        <span>
          <i className="swatch" style={{ background: 'var(--green)' }} />
          Entró {formatSolesShort(incomeCents)}
        </span>
      </div>
      <p className="sunday-line" data-testid="if-arrives">
        <Icon name="clock" size={18} />
        <span>
          {formatSolesShort(projection.projectedCents)} {owedCents > 0 ? 'si llega lo esperado ' : ''}→ a Ahorro el domingo
        </span>
      </p>
    </section>
  )
}
