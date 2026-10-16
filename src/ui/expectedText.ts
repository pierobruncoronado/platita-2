import { RECURRING_TEMPLATES } from '../domain/catalog'
import type { ExpectedItem, ExpectedStatus, RecurringTemplate } from '../domain/expected'
import { formatSolesShort } from '../domain/money'

function templateOf(item: ExpectedItem): RecurringTemplate | undefined {
  return RECURRING_TEMPLATES.find((t) => t.id === item.templateId)
}

export function shortLabel(item: ExpectedItem): string {
  return templateOf(item)?.shortLabel ?? item.label
}

export function cadenceText(t: RecurringTemplate): string {
  const every = t.cadence.kind === 'monthly' ? 'mensual' : t.cadence.kind === 'weekly' ? 'semanal' : 'cada 2 semanas'
  return `${formatSolesShort(t.amountCents)} · ${every} · ${t.windowLabel}`
}

// "Faltan S/30 · ya recibiste S/50 de S/80" | "S/100 · llega de lun a jue" | "S/100"
export function expectedSubtitle(item: ExpectedItem, status: ExpectedStatus): string {
  if (status.confirmedCents > 0) {
    return `Faltan ${formatSolesShort(status.remainingCents)} · ya recibiste ${formatSolesShort(status.confirmedCents)} de ${formatSolesShort(item.amountCents)}`
  }
  if (status.state === 'overdue') return formatSolesShort(item.amountCents)
  const t = templateOf(item)
  return t ? `${formatSolesShort(item.amountCents)} · llega ${t.windowLabel}` : formatSolesShort(item.amountCents)
}
