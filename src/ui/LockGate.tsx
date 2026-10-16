import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { db } from '../db/db'
import { clearPin, getBiometric, getLockedUntil, getPinState, setPin, tryUnlock, type PinState } from '../db/lock'
import { PIN_LENGTH, shouldRelock } from '../domain/pin'
import { biometricSupported, verifyBiometric } from './biometric'
import { PinPad } from './PinPad'

// Spec §4 "PIN lock mechanics". Nothing from the app renders until the PIN (or the fingerprint)
// passes: first launch = mandatory setup, every cold open and every return after ≥60 s asks again.
// The content is covered the moment the page goes to the background (best effort for the recents thumbnail).
export function LockGate({ children }: { children: ReactNode }) {
  const [pinState, setPinState] = useState<PinState | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [unlockedOnce, setUnlockedOnce] = useState(false) // after a re-lock the screen state is kept, just hidden
  const [covered, setCovered] = useState(false)
  const hiddenAt = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      setPinState(await getPinState(db))
    } catch (err) {
      console.error(JSON.stringify({ event: 'pin_state_failed', message: String(err) }))
      setPinState({ kind: 'corrupt' }) // fail closed: locked, only "Olvidé mi PIN" can proceed
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const state = await getPinState(db)
        if (!cancelled) setPinState(state)
      } catch (err) {
        console.error(JSON.stringify({ event: 'pin_state_failed', message: String(err) }))
        if (!cancelled) setPinState({ kind: 'corrupt' }) // fail closed
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        setCovered(true)
        return
      }
      if (hiddenAt.current !== null && shouldRelock(hiddenAt.current, Date.now())) setUnlocked(false)
      hiddenAt.current = null
      setCovered(false)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const unlock = useCallback(() => {
    setUnlocked(true)
    setUnlockedOnce(true)
  }, [])

  if (pinState === null) return <main className="screen" aria-busy="true" />

  if (pinState.kind === 'none') {
    return (
      <PinSetup
        onDone={async (pin) => {
          await setPin(db, pin)
          unlock()
          await refresh()
        }}
      />
    )
  }

  const entry = (
    <PinEntry
      corrupt={pinState.kind === 'corrupt'}
      onUnlocked={unlock}
      onForgot={async () => {
        await clearPin(db)
        await refresh()
      }}
    />
  )

  // Cold open: nothing from the app is even mounted until the PIN passes.
  if (!unlocked && !unlockedOnce) return entry

  // Same tree before and after a re-lock, so what the user was typing survives; it is only hidden.
  return (
    <>
      <div hidden={!unlocked}>{children}</div>
      {!unlocked && entry}
      {unlocked && covered && (
        <div className="privacy-cover" data-testid="privacy-cover">
          <span className="privacy-mark">Platita</span>
        </div>
      )}
    </>
  )
}

function PinSetup({ onDone }: { onDone: (pin: string) => Promise<void> }) {
  const [first, setFirst] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  async function entered(pin: string) {
    if (first === null) {
      setFirst(pin)
      setMessage(null)
      setResetKey((k) => k + 1)
      return
    }
    if (pin !== first) {
      setFirst(null)
      setMessage('No coinciden. Empieza otra vez.')
      setResetKey((k) => k + 1)
      return
    }
    setBusy(true)
    try {
      await onDone(pin)
    } catch (err) {
      console.error(JSON.stringify({ event: 'pin_setup_failed', message: String(err) }))
      setFirst(null)
      setMessage('No se pudo guardar el PIN. Intenta otra vez.')
      setBusy(false)
      setResetKey((k) => k + 1)
    }
  }

  return (
    <main className="screen lock" data-testid="pin-setup">
      <h1 className="lock-title">{first === null ? 'Crea tu PIN' : 'Repítelo'}</h1>
      <p className="muted small lock-sub">
        {first === null ? `${PIN_LENGTH} dígitos para abrir Platita.` : 'Escríbelo de nuevo para confirmar.'}
      </p>
      <PinPad key={resetKey} onComplete={entered} disabled={busy} />
      <p className={`small lock-msg ${message ? 'error' : 'muted'}`} role="status">
        {message ?? 'Si lo olvidas, puedes quitarlo y crear otro: tus datos no se borran.'}
      </p>
    </main>
  )
}

function PinEntry({ corrupt, onUnlocked, onForgot }: { corrupt: boolean; onUnlocked: () => void; onForgot: () => Promise<void> }) {
  const [message, setMessage] = useState<string | null>(corrupt ? 'No se puede leer el PIN guardado.' : null)
  const [waitUntil, setWaitUntil] = useState(0)
  const [tick, setTick] = useState(() => Date.now())
  const [resetKey, setResetKey] = useState(0)
  const [bioId, setBioId] = useState<string | null>(null)
  const [confirmForgot, setConfirmForgot] = useState(false)
  const [checking, setChecking] = useState(false)
  const bioTried = useRef(false)

  const unlockWithBiometric = useCallback(
    async (id: string, manual = false) => {
      if (await verifyBiometric(id)) onUnlocked()
      else if (manual) setMessage('No se pudo usar la huella. Usa tu PIN.')
    },
    [onUnlocked],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [until, bio] = await Promise.all([getLockedUntil(db), getBiometric(db)])
        if (cancelled) return
        setWaitUntil(until)
        if (bio.id && !corrupt && (await biometricSupported()) && !bioTried.current) {
          bioTried.current = true
          setBioId(bio.id)
          void unlockWithBiometric(bio.id) // one automatic prompt per lock screen; the PIN is always there
        }
      } catch (err) {
        console.error(JSON.stringify({ event: 'lock_state_failed', message: String(err) }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [corrupt, unlockWithBiometric])

  useEffect(() => {
    if (waitUntil <= Date.now()) return
    const id = setInterval(() => {
      const now = Date.now()
      setTick(now)
      if (now >= waitUntil) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [waitUntil])

  const waitSeconds = Math.max(0, Math.ceil((waitUntil - tick) / 1000))
  const waiting = waitSeconds > 0

  async function entered(pin: string) {
    const now = Date.now()
    setChecking(true)
    try {
      const r = await tryUnlock(db, pin, now)
      if (r.ok) {
        onUnlocked()
        return
      }
      if (r.waitMs > 0) {
        setWaitUntil(now + r.waitMs)
        setTick(now)
      }
      setMessage(r.reason === 'unreadable' ? 'No se puede leer el PIN guardado.' : r.reason === 'waiting' ? null : 'PIN incorrecto.')
    } catch (err) {
      console.error(JSON.stringify({ event: 'pin_check_failed', message: String(err) }))
      setMessage('No se pudo comprobar el PIN. Intenta otra vez.')
    }
    setChecking(false)
    setResetKey((k) => k + 1)
  }

  if (confirmForgot) {
    return (
      <main className="screen lock" data-testid="forgot-confirm">
        <h1 className="lock-title">¿Quitar el PIN?</h1>
        <p className="muted lock-sub">Tus datos no se borran. Te pediremos crear un PIN nuevo ahora mismo.</p>
        <button type="button" className="delete" onClick={() => void onForgot()}>
          Quitar el PIN
        </button>
        <button type="button" className="btn-outline" onClick={() => setConfirmForgot(false)}>
          Cancelar
        </button>
      </main>
    )
  }

  return (
    <main className="screen lock" data-testid="pin-entry">
      <h1 className="lock-title">Platita</h1>
      <p className="muted small lock-sub">Escribe tu PIN</p>
      {!corrupt && <PinPad key={resetKey} onComplete={entered} disabled={waiting || checking} />}
      <p className={`small lock-msg ${message && !waiting ? 'error' : 'muted'}`} role="status" data-testid="lock-msg">
        {waiting ? `Espera ${waitSeconds} s para volver a intentar.` : message}
      </p>
      {bioId && !corrupt && (
        <button type="button" className="btn-outline" onClick={() => void unlockWithBiometric(bioId, true)}>
          Usar huella
        </button>
      )}
      <button type="button" className="lock-forgot" disabled={waiting} onClick={() => setConfirmForgot(true)}>
        Olvidé mi PIN
      </button>
    </main>
  )
}
