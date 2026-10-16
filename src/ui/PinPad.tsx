import { useState } from 'react'
import { PIN_LENGTH } from '../domain/pin'
import { Icon } from './icons'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const

// Numeric PIN entry (same keypad look as Captura). Calls onComplete once PIN_LENGTH digits are typed
// and clears itself, so a wrong PIN simply starts over (parents remount it with `key` to reset). Never shows the digits.
export function PinPad({ onComplete, disabled = false }: { onComplete: (pin: string) => void; disabled?: boolean }) {
  const [pin, setPin] = useState('')

  function press(key: (typeof KEYS)[number]) {
    if (disabled || key === '') return
    if (key === 'back') {
      setPin((p) => p.slice(0, -1))
      return
    }
    const next = pin + key
    if (next.length < PIN_LENGTH) {
      setPin(next)
      return
    }
    setPin('')
    onComplete(next)
  }

  return (
    <div className="pinpad">
      <div className="pin-dots" role="img" aria-label={`${pin.length} de ${PIN_LENGTH} dígitos`} data-testid="pin-dots">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <div className="keypad">
        {KEYS.map((k, i) =>
          k === '' ? (
            <span key={i} aria-hidden="true" />
          ) : (
            <button key={k} type="button" className="key" aria-label={k === 'back' ? 'Borrar' : k} disabled={disabled} onClick={() => press(k)}>
              {k === 'back' ? <Icon name="back" size={22} /> : k}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
