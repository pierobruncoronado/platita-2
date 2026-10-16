// Shared pieces of the expense and income forms: amount keypad, amount display, date chip.
import { useRef, useState } from 'react'
import { centsToInput, parseAmountCents, pressKey, type KeypadKey } from '../domain/amount'
import { fromDateTimeInput, toDateTimeInput, whenLabel } from '../domain/labels'
import type { Opening } from '../domain/flow'
import { replaceRoute, type Route } from './hooks'
import { Icon } from './icons'

const KEYS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

// What the user already typed survives a Gasto ⇄ Ingreso switch.
export interface Draft {
  amount: string
  note: string
  occurredAt: string | null
}

let carried: Draft | null = null

// Read once by the form that mounts after a switch.
export function takeDraft(): Draft | null {
  const d = carried
  carried = null
  return d
}

export function useAmountInput(initial = '') {
  const [amount, setAmount] = useState(initial)
  const [fresh, setFresh] = useState(false) // a loaded amount not touched yet: first key replaces it

  function load(cents: number) {
    setAmount(centsToInput(cents))
    setFresh(true)
  }

  function tapKey(k: KeypadKey) {
    // Close the Android keyboard if a text field had focus, so it can't cover the keypad.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setAmount((a) => pressKey(fresh ? '' : a, k))
    setFresh(false)
  }

  return { amount, fresh, cents: parseAmountCents(amount), load, tapKey }
}

export function AmountDisplay({ amount, fresh, tone }: { amount: string; fresh: boolean; tone?: 'income' }) {
  return (
    <>
      <p
        className={`amount ${amount === '' ? 'amount-empty' : ''} ${fresh ? 'amount-fresh' : ''} ${tone === 'income' && amount !== '' ? 'amount-income' : ''}`}
        aria-live="polite"
        data-testid="amount"
      >
        S/ <span className="amount-value">{amount === '' ? '0' : amount}</span>
      </p>
      {fresh && <p className="muted small hint">Teclea para cambiar el monto</p>}
    </>
  )
}

export function Keypad({ onKey }: { onKey: (k: KeypadKey) => void }) {
  return (
    <div className="keypad">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          className="key"
          aria-label={k === 'back' ? 'Borrar' : k === '.' ? 'Punto decimal' : k}
          onClick={() => onKey(k)}
        >
          {k === 'back' ? <Icon name="back" /> : k}
        </button>
      ))}
    </div>
  )
}

interface WhenProps {
  occurredAt: string | null // null = "now" at save
  minIso?: string // stricter lower bound than the opening (e.g. an expected item's window start)
  onChange: (iso: string) => void
  onError: (message: string | null) => void
  now: string
  tz: string
  opening: Opening
}

// Date/time chip: native picker, read as wall-clock time in the configured tz, bounded to [opening, now].
export function WhenField({ occurredAt, minIso, onChange, onError, now, tz, opening }: WhenProps) {
  const input = useRef<HTMLInputElement>(null)
  const floor = minIso && minIso > opening.at ? minIso : opening.at

  function open() {
    if (!input.current) return
    try {
      input.current.showPicker()
    } catch {
      input.current.focus()
    }
  }

  return (
    <>
      <button type="button" className="when" onClick={open}>
        {whenLabel(occurredAt ?? now, now, tz)}
      </button>
      <input
        ref={input}
        type="datetime-local"
        className="visually-hidden"
        tabIndex={-1}
        aria-label="Fecha y hora"
        value={toDateTimeInput(occurredAt ?? now, tz)}
        min={toDateTimeInput(floor, tz)}
        max={toDateTimeInput(now, tz)}
        onChange={(e) => {
          const iso = fromDateTimeInput(e.target.value, tz)
          if (!iso || iso > new Date().toISOString()) return
          // Anything before the opening balance is already inside it and would never count.
          if (iso < opening.at) {
            onError(`Esa fecha es anterior a tu saldo inicial (${whenLabel(opening.at, now, tz)}); ya está incluida en él.`)
            return
          }
          if (iso < floor) {
            onError(`La fecha no puede ser anterior a ${whenLabel(floor, now, tz)}.`)
            return
          }
          onError(null)
          onChange(iso)
        }}
      />
    </>
  )
}

// Gasto / Ingreso switch on the new-movement screen (Captura board).
export function KindToggle({ active, draft }: { active: 'expense' | 'income'; draft: Draft }) {
  const target: Record<'expense' | 'income', Route> = {
    expense: { name: 'capture', id: null },
    income: { name: 'income', id: null, expectedId: null },
  }
  return (
    <div className="kind-toggle" role="tablist" aria-label="Tipo de movimiento">
      {(['expense', 'income'] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={k === active}
          className={`kind ${k === active ? 'kind-on' : ''}`}
          onClick={() => {
            if (k === active) return
            carried = draft
            replaceRoute(target[k])
          }}
        >
          {k === 'expense' ? 'Gasto' : 'Ingreso'}
        </button>
      ))}
    </div>
  )
}
