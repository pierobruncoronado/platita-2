import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { createExpense, setUndone, updateExpense } from '../db/movements'
import { CATEGORIES, categoryById, type CategoryId } from '../domain/catalog'
import { formatSolesShort } from '../domain/money'
import type { AppSettings } from './App'
import { AmountDisplay, KindToggle, Keypad, takeDraft, useAmountInput, WhenField } from './form'
import { replaceRoute, returnRoute, useNow } from './hooks'
import { Icon } from './icons'
import type { ToastInput } from './UndoToast'

interface Props {
  settings: AppSettings
  editId: string | null
  onCreated: (t: ToastInput) => void
}

export function Capture({ settings, editId, onCreated }: Props) {
  const { tz, opening } = settings
  const [now] = useNow()
  const [draft] = useState(() => (editId ? null : takeDraft()))
  const amount = useAmountInput(draft?.amount)
  const [category, setCategory] = useState<CategoryId | null>(null)
  const [subtype, setSubtype] = useState<string | null>(null)
  const [note, setNote] = useState(draft?.note ?? '')
  const [occurredAt, setOccurredAt] = useState<string | null>(draft?.occurredAt ?? null) // null = "now" at save
  const [loaded, setLoaded] = useState(editId === null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { load } = amount

  useEffect(() => {
    if (!editId) return
    let cancelled = false
    db.movements
      .get(editId)
      .then((m) => {
        if (cancelled) return
        // Undone movements are out of every total; editing them would be invisible.
        if (!m || m.type !== 'expense' || m.undone) {
          replaceRoute({ name: 'home' })
          return
        }
        load(m.amountCents)
        setCategory(categoryById(m.category)?.id ?? null)
        setSubtype(m.subtype)
        setNote(m.note)
        setOccurredAt(m.occurredAt)
        setLoaded(true)
      })
      .catch((err) => {
        console.error(JSON.stringify({ event: 'movement_load_failed', message: String(err) }))
        if (!cancelled) setError('No se pudo abrir este gasto.')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per id
  }, [editId])

  const selected = categoryById(category)
  const canSave = loaded && !saving && amount.cents !== null && selected !== undefined

  function chooseCategory(id: CategoryId) {
    if (id !== category) setSubtype(null)
    setCategory(id)
  }

  async function save() {
    if (!canSave || amount.cents === null || !selected) return
    setSaving(true)
    setError(null)
    const at = new Date().toISOString()
    const input = { amountCents: amount.cents, category: selected.id, subtype, note, occurredAt: occurredAt ?? at }
    try {
      if (editId) {
        await updateExpense(db, editId, input, tz)
      } else {
        const m = await createExpense(db, input, at, tz)
        const label = subtype ?? selected.label
        onCreated({ movementId: m.id, message: `${label} ${formatSolesShort(amount.cents)} anotado`, undoTo: true })
      }
      replaceRoute(returnRoute())
    } catch (err) {
      console.error(JSON.stringify({ event: 'expense_save_failed', message: String(err) }))
      setError('No se pudo guardar. Intenta otra vez.')
      setSaving(false)
    }
  }

  // Delete = undone flag (kept for export), reversible from the toast.
  async function remove() {
    if (!editId || saving) return
    setSaving(true)
    setError(null)
    try {
      await setUndone(db, editId, true)
      const label = subtype ?? selected?.label ?? 'Gasto'
      onCreated({ movementId: editId, message: `${label} eliminado`, undoTo: false })
      replaceRoute(returnRoute())
    } catch (err) {
      console.error(JSON.stringify({ event: 'expense_delete_failed', message: String(err) }))
      setError('No se pudo eliminar. Intenta otra vez.')
      setSaving(false)
    }
  }

  return (
    <main className="screen capture">
      <header className="capture-top">
        <button type="button" className="icon-btn" aria-label="Cerrar" onClick={() => replaceRoute(returnRoute())}>
          <Icon name="close" size={20} strokeWidth={2.2} />
        </button>
        {editId ? <h1 className="capture-title">Editar gasto</h1> : <KindToggle active="expense" draft={{ amount: amount.amount, note, occurredAt }} />}
        <span className="icon-spacer" aria-hidden="true" />
      </header>
      {!editId && <h1 className="visually-hidden">Nuevo gasto</h1>}

      <AmountDisplay amount={amount.amount} fresh={amount.fresh} />

      <div className="chips" role="radiogroup" aria-label="Categoría">
        {CATEGORIES.map((c) => {
          const on = c.id === category
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={`chip ${on ? 'chip-on' : ''}`}
              style={on ? { color: c.color, borderColor: c.color, background: `${c.color}2E` } : undefined}
              onClick={() => chooseCategory(c.id)}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {selected && selected.subtypes.length > 0 && (
        <div className="chips" role="radiogroup" aria-label="Detalle (opcional)">
          {selected.subtypes.map((s) => {
            const on = s === subtype
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={on}
                className={`chip chip-sub ${on ? 'chip-sub-on' : ''}`}
                style={on ? { borderColor: selected.color } : undefined}
                onClick={() => setSubtype(on ? null : s)}
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
        <WhenField occurredAt={occurredAt} onChange={setOccurredAt} onError={setError} now={now} tz={tz} opening={opening} />
      </div>

      <Keypad onKey={amount.tapKey} />

      {error && <p className="error small">{error}</p>}

      <button type="button" className="save" disabled={!canSave} onClick={save}>
        Guardar
      </button>

      {editId && loaded && (
        <button type="button" className="delete" disabled={saving} onClick={remove}>
          Eliminar gasto
        </button>
      )}
    </main>
  )
}
