import { useCallback, useEffect, useState } from 'react'
import { db } from '../db/db'
import { setUndone } from '../db/movements'
import { getOpening, getTimezone, seedDefaults } from '../db/seed'
import type { Opening } from '../domain/flow'
import { Capture } from './Capture'
import { Home } from './Home'
import { IncomeForm } from './IncomeForm'
import { Incomes } from './Incomes'
import { useRoute } from './hooks'
import { UndoToast, type Toast, type ToastInput } from './UndoToast'

let toastSeq = 0

export interface AppSettings {
  tz: string
  opening: Opening
}

type State = { kind: 'loading' } | { kind: 'ready'; settings: AppSettings } | { kind: 'error' }

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [toast, setToast] = useState<Toast | null>(null)
  const route = useRoute()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await seedDefaults(db)
        const [tz, opening] = await Promise.all([getTimezone(db), getOpening(db)])
        if (!cancelled) setState({ kind: 'ready', settings: { tz, opening } })
      } catch (err) {
        console.error(JSON.stringify({ event: 'settings_load_failed', message: String(err) }))
        if (!cancelled) setState({ kind: 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const showUndo = useCallback((t: ToastInput) => setToast({ ...t, key: ++toastSeq }), [])
  const dismiss = useCallback(() => setToast(null), [])

  const undo = useCallback(async (t: Toast) => {
    try {
      await setUndone(db, t.movementId, t.undoTo)
      setToast(null)
    } catch (err) {
      console.error(JSON.stringify({ event: 'undo_failed', message: String(err) }))
      // Keep the toast (fresh 5 s) so the failure is visible and can be retried.
      setToast({ ...t, message: 'No se pudo deshacer. Intenta otra vez.', key: ++toastSeq })
    }
  }, [])

  if (state.kind === 'loading') return <main className="screen" aria-busy="true" />
  if (state.kind === 'error') {
    return (
      <main className="screen">
        <p className="error">No se pudieron leer los datos guardados.</p>
      </main>
    )
  }

  return (
    <>
      {route.name === 'capture' && (
        <Capture key={route.id ?? 'new'} settings={state.settings} editId={route.id} onCreated={showUndo} />
      )}
      {route.name === 'income' && (
        <IncomeForm
          key={route.expectedId ?? route.id ?? 'new'}
          settings={state.settings}
          editId={route.id}
          expectedId={route.expectedId}
          onCreated={showUndo}
        />
      )}
      {route.name === 'incomes' && <Incomes settings={state.settings} />}
      {route.name === 'home' && <Home settings={state.settings} onCreated={showUndo} />}
      {toast && <UndoToast toast={toast} onUndo={undo} onDone={dismiss} />}
    </>
  )
}
