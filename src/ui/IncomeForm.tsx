import { useEffect, useState } from 'react'
import { db, type Movement } from '../db/db'
import { confirmIncome, createIncome, setUndone, updateIncome } from '../db/movements'
import { INCOME_SOURCES, RECURRING_TEMPLATES } from '../domain/catalog'
import { expectedStatus, generateExpected, type ExpectedItem, type ExpectedStatus } from '../domain/expected'
import { formatSolesShort } from '../domain/money'
import type { AppSettings } from './App'
import { AmountDisplay, KindToggle, Keypad, takeDraft, useAmountInput, WhenField } from './form'
import { replaceRoute, returnRoute, useNow } from './hooks'
import { Icon } from './icons'
import type { ToastInput } from './UndoToast'

interface Props {
  settings: AppSettings
  editId: string | null
  expectedId: string | null
  onCreated: (t: ToastInput) => void
}

type Mode =
  | { kind: 'new' }
  | { kind: 'confirm'; item: ExpectedItem; status: ExpectedStatus }
  | { kind: 'edit'; movement: Movement }

const leave = () => replaceRoute(returnRoute())

export function IncomeForm({ settings, editId, expectedId, onCreated }: Props) {
  const { tz, opening } = settings
  const [now] = useNow()
  const [draft] = useState(() => (editId || expectedId ? null : takeDraft()))
  const amount = useAmountInput(draft?.amount)
  const [mode, setMode] = useState<Mode | null>(editId || expectedId ? null : { kind: 'new' })
  const [source, setSource] = useState<string | null>(null)
  const [note, setNote] = useState(draft?.note ?? '')
  const [occurredAt, setOccurredAt] = useState<string | null>(draft?.occurredAt ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { load } = amount

  useEffect(() => {
    if (!editId && !expectedId) return
    let cancelled = false
    ;(async () => {
      try {
        if (expectedId) {
          const at = new Date().toISOString()
          const item = generateExpected(RECURRING_TEMPLATES, at, tz).find((i) => i.id === expectedId)
          const related = item ? await db.movements.where('recurringId').equals(item.id).toArray() : []
          const status = item ? expectedStatus(item, related, at) : null
          if (cancelled) return
          if (!item || !status || status.state === 'settled') return leave()
          load(status.remainingCents)
          setMode({ kind: 'confirm', item, status })
        } else if (editId) {
          const m = await db.movements.get(editId)
          if (cancelled) return
          if (!m || m.type !== 'income' || m.undone) return leave()
          load(m.amountCents)
          // A source outside the current chips must be re-picked (save would reject it).
          setSource(m.recurringId || (m.source && INCOME_SOURCES.includes(m.source)) ? m.source : null)
          setNote(m.note)
          setOccurredAt(m.occurredAt)
          setMode({ kind: 'edit', movement: m })
        }
      } catch (err) {
        console.error(JSON.stringify({ event: 'income_load_failed', message: String(err) }))
        if (!cancelled) setError('No se pudo abrir este ingreso.')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per target
  }, [editId, expectedId])

  const recurring = mode?.kind === 'confirm' || (mode?.kind === 'edit' && mode.movement.recurringId !== null)
  const canSave = mode !== null && !saving && amount.cents !== null && (recurring || source !== null)

  async function save() {
    if (!mode || !canSave || amount.cents === null) return
    setSaving(true)
    setError(null)
    const at = new Date().toISOString()
    const when = occurredAt ?? at
    try {
      if (mode.kind === 'confirm') {
        const m = await confirmIncome(db, mode.item, amount.cents, note, when, at, tz)
        onCreated({ movementId: m.id, message: `${mode.item.label} +${formatSolesShort(amount.cents)} confirmado`, undoTo: true })
      } else if (mode.kind === 'new' && source) {
        const m = await createIncome(db, { amountCents: amount.cents, source, note, occurredAt: when }, at, tz)
        onCreated({ movementId: m.id, message: `${source} +${formatSolesShort(amount.cents)} anotado`, undoTo: true })
      } else if (mode.kind === 'edit') {
        await updateIncome(db, mode.movement.id, { amountCents: amount.cents, source: source ?? '', note, occurredAt: when }, tz)
      }
      leave()
    } catch (err) {
      console.error(JSON.stringify({ event: 'income_save_failed', message: String(err) }))
      setError('No se pudo guardar. Intenta otra vez.')
      setSaving(false)
    }
  }

  async function remove() {
    if (mode?.kind !== 'edit' || saving) return
    setSaving(true)
    try {
      await setUndone(db, mode.movement.id, true)
      onCreated({ movementId: mode.movement.id, message: `${mode.movement.source ?? 'Ingreso'} eliminado`, undoTo: false })
      leave()
    } catch (err) {
      console.error(JSON.stringify({ event: 'income_delete_failed', message: String(err) }))
      setError('No se pudo eliminar. Intenta otra vez.')
      setSaving(false)
    }
  }

  return (
    <main className="screen capture">
      <header className="capture-top">
        <button type="button" className="icon-btn" aria-label="Cerrar" onClick={leave}>
          <Icon name="close" size={20} strokeWidth={2.2} />
        </button>
        {mode?.kind === 'new' ? (
          <KindToggle active="income" draft={{ amount: amount.amount, note, occurredAt }} />
        ) : (
          <h1 className="capture-title">{mode?.kind === 'confirm' ? 'Confirmar ingreso' : 'Editar ingreso'}</h1>
        )}
        <span className="icon-spacer" aria-hidden="true" />
      </header>
      {mode?.kind === 'new' && <h1 className="visually-hidden">Nuevo ingreso</h1>}

      {mode?.kind === 'confirm' && (
        <div className="expected-head">
          <span className="expected-title">{mode.item.label}</span>
          <span className="expected-sub">
            {mode.status.confirmedCents > 0
              ? `Faltan ${formatSolesShort(mode.status.remainingCents)} de ${formatSolesShort(mode.item.amountCents)}`
              : `Esperado ${formatSolesShort(mode.item.amountCents)}`}
            {mode.status.state === 'overdue' && <span className="tag-overdue">atrasada</span>}
          </span>
        </div>
      )}

      <AmountDisplay amount={amount.amount} fresh={amount.fresh} tone="income" />

      {recurring && mode?.kind === 'edit' && <p className="muted small">{mode.movement.source}</p>}
      {!recurring && mode !== null && (
        <div className="chips" role="radiogroup" aria-label="¿De quién?">
          {INCOME_SOURCES.map((s) => {
            const on = s === source
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={on}
                className={`chip ${on ? 'chip-income-on' : ''}`}
                onClick={() => setSource(s)}
              >
                {s}
              </button>
            )
          })}
        </div>
      )}

      <div className="meta">
        <label className="note">
          <span className="visually-hidden">Nota</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota (opcional)"
            maxLength={120}
            enterKeyHint="done"
          />
        </label>
        <WhenField
          occurredAt={occurredAt}
          minIso={mode?.kind === 'confirm' ? mode.item.windowStart : undefined}
          onChange={setOccurredAt} onError={setError} now={now} tz={tz} opening={opening} />
      </div>

      <Keypad onKey={amount.tapKey} />

      {error && <p className="error small">{error}</p>}

      <button type="button" className="save" disabled={!canSave} onClick={save}>
        {mode?.kind === 'confirm' ? 'Confirmar' : 'Guardar'}
      </button>

      {mode?.kind === 'edit' && (
        <button type="button" className="delete" disabled={saving} onClick={remove}>
          Eliminar ingreso
        </button>
      )}
    </main>
  )
}
