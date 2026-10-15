import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { getOpeningBalanceCents, seedDefaults } from '../db/seed'
import { formatSoles } from '../domain/money'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; balanceCents: number }
  | { kind: 'error' }

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await seedDefaults(db)
        // H1: no movements yet, so "En cuenta" equals the opening balance. H2 adds weekly_net.
        const balanceCents = await getOpeningBalanceCents(db)
        if (!cancelled) setState({ kind: 'ready', balanceCents })
      } catch (err) {
        console.error(JSON.stringify({ event: 'balance_load_failed', message: String(err) }))
        if (!cancelled) setState({ kind: 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="screen">
      <section className="balance-card" aria-live="polite">
        <p className="label">En cuenta</p>
        {state.kind === 'ready' && (
          <p className="balance" data-testid="balance">
            {formatSoles(state.balanceCents)}
          </p>
        )}
        {state.kind === 'loading' && <p className="balance muted">…</p>}
        {state.kind === 'error' && <p className="error">No se pudo leer el saldo guardado.</p>}
      </section>
    </main>
  )
}
