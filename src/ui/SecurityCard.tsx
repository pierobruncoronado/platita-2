import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { getBiometric, saveBiometric } from '../db/lock'
import { biometricSupported, enrollBiometric } from './biometric'

// Bottom of Inicio (there is no settings screen). The PIN itself is mandatory and handled by LockGate;
// this card only offers the fingerprint spike (spec decision 2) and records how it went.
export function SecurityCard() {
  const bio = useLiveQuery(() => getBiometric(db), [], undefined)
  const [supported, setSupported] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void biometricSupported().then((ok) => {
      if (!cancelled) setSupported(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (bio === undefined || supported === null) return null

  async function enable() {
    setBusy(true)
    setMessage(null)
    try {
      const id = await enrollBiometric()
      await saveBiometric(db, id, 'ok')
      setMessage('Huella activada. El PIN sigue funcionando.')
    } catch (err) {
      const reason = err instanceof Error ? err.name : 'unknown'
      console.error(JSON.stringify({ event: 'biometric_enroll_failed', reason }))
      await saveBiometric(db, null, `failed:${reason}`)
      setMessage('No se pudo activar la huella. Sigues con tu PIN.')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    await saveBiometric(db, null, 'off')
    setMessage('Huella desactivada.')
  }

  return (
    <section className="card-flat security-card" aria-label="Seguridad" data-testid="security-card">
      <div className="row-main">
        <span className="row-title">Seguridad</span>
        <span className="row-sub security-sub">
          PIN activo ·{' '}
          {bio.id ? 'Huella activada' : supported ? 'Huella disponible' : 'Huella no disponible en este teléfono'}
        </span>
      </div>
      {supported && !bio.id && (
        <button type="button" className="btn-outline" disabled={busy} onClick={enable}>
          Activar huella
        </button>
      )}
      {bio.id && (
        <button type="button" className="btn-outline" onClick={disable}>
          Desactivar huella
        </button>
      )}
      {message && (
        <p className="small muted" role="status">
          {message}
        </p>
      )}
    </section>
  )
}
