import { useEffect, useRef, useState } from 'react'
import { db } from '../db/db'
import { createExpense, setUndone, updateExpense } from '../db/movements'
import { centsToInput, parseAmountCents, pressKey, type KeypadKey } from '../domain/amount'
import { CATEGORIES, categoryById, type CategoryId } from '../domain/catalog'
import { fromDateTimeInput, toDateTimeInput, whenLabel } from '../domain/labels'
import { formatSolesShort } from '../domain/money'
import type { AppSettings } from './App'
import { replaceRoute, useNow } from './hooks'
import { Icon } from './icons'
import type { ToastInput } from './UndoToast'

const KEYS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

interface Props {
  settings: AppSettings
  editId: string | null
  onCreated: (t: ToastInput) => void
}

export function Capture({ settings, editId, onCreated }: Props) {
  const { tz, opening } = settings
  const [now] = useNow()
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<CategoryId | null>(null)
  const [subtype, setSubtype] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [occurredAt, setOccurredAt] = useState<string | null>(null) // null = "now" at save
  const [loaded, setLoaded] = useState(editId === null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [amountFresh, setAmountFresh] = useState(false) // edit mode: loaded amount not touched yet
  const dateInput = useRef<HTMLInputElement>(null)

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
        setAmount(centsToInput(m.amountCents))
        setAmountFresh(true)
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
  }, [editId])

  const amountCents = parseAmountCents(amount)
  const selected = categoryById(category)
  const canSave = loaded && !saving && amountCents !== null && selected !== undefined

  function chooseCategory(id: CategoryId) {
    if (id !== category) setSubtype(null)
    setCategory(id)
  }

  function openDatePicker() {
    const input = dateInput.current
    if (!input) return
    try {
      input.showPicker()
    } catch {
      input.focus()
    }
  }

  async function save() {
    if (!canSave || amountCents === null || !selected) return
    setSaving(true)
    setError(null)
    const at = new Date().toISOString()
    const input = { amountCents, category: selected.id, subtype, note, occurredAt: occurredAt ?? at }
    try {
      if (editId) {
        await updateExpense(db, editId, input, tz)
      } else {
        const m = await createExpense(db, input, at, tz)
        const label = subtype ?? selected.label
        onCreated({ movementId: m.id, message: `${label} ${formatSolesShort(amountCents)} anotado`, undoTo: true })
      }
      replaceRoute({ name: 'home' })
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
      replaceRoute({ name: 'home' })
    } catch (err) {
      console.error(JSON.stringify({ event: 'expense_delete_failed', message: String(err) }))
      setError('No se pudo eliminar. Intenta otra vez.')
      setSaving(false)
    }
  }

  function tapKey(k: KeypadKey) {
    // Close the Android keyboard if the note had focus, so it can't cover the keypad.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    // In edit mode the loaded amount is "selected": the first key replaces it.
    setAmount((a) => pressKey(amountFresh ? '' : a, k))
    setAmountFresh(false)
  }

  return (
    <main className="screen capture">
      <header className="capture-top">
        <button type="button" className="icon-btn" aria-label="Cerrar" onClick={() => replaceRoute({ name: 'home' })}>
          <Icon name="close" size={20} strokeWidth={2.2} />
        </button>
        <h1 className="capture-title">{editId ? 'Editar gasto' : 'Nuevo gasto'}</h1>
        <span className="icon-spacer" aria-hidden="true" />
      </header>

      <p
        className={`amount ${amount === '' ? 'amount-empty' : ''} ${amountFresh ? 'amount-fresh' : ''}`}
        aria-live="polite"
        data-testid="amount"
      >
        S/ <span className="amount-value">{amount === '' ? '0' : amount}</span>
      </p>
      {amountFresh && <p className="muted small hint">Teclea para cambiar el monto</p>}

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
        <button type="button" className="when" onClick={openDatePicker}>
          {whenLabel(occurredAt ?? now, now, tz)}
        </button>
        <input
          ref={dateInput}
          type="datetime-local"
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Fecha y hora"
          value={toDateTimeInput(occurredAt ?? now, tz)}
          min={toDateTimeInput(opening.at, tz)}
          max={toDateTimeInput(now, tz)}
          onChange={(e) => {
            const iso = fromDateTimeInput(e.target.value, tz)
            if (!iso || iso > new Date().toISOString()) return
            // Spending before the opening balance is already inside it and would never count.
            if (iso < opening.at) {
              setError(`Esa fecha es anterior a tu saldo inicial (${whenLabel(opening.at, now, tz)}); ya está incluida en él.`)
              return
            }
            setError(null)
            setOccurredAt(iso)
          }}
        />
      </div>

      <div className="keypad">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className="key"
            aria-label={k === 'back' ? 'Borrar' : k === '.' ? 'Punto decimal' : k}
            onClick={() => tapKey(k)}
          >
            {k === 'back' ? <Icon name="back" /> : k}
          </button>
        ))}
      </div>

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
