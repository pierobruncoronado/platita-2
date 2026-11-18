import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { supabase } from '../data/ledgerClient'
import { fetchSnapshot, isAuthFailure, type LedgerSnapshot } from '../data/ledgerRead'
import { db } from '../db/db'
import { loadSnapshot, saveSnapshot } from '../db/ledgerCache'

export type LedgerState =
  | { kind: 'loading' }
  | { kind: 'login' }
  // stale = shown from the on-device cache because the live read failed (offline, row cap, server error).
  | { kind: 'ready'; snapshot: LedgerSnapshot; stale: boolean }
  | { kind: 'error'; message: string }

const REFRESH_MS = 60_000

async function fromCacheOrError(message: string): Promise<LedgerState> {
  const cached = await loadSnapshot(db)
  return cached ? { kind: 'ready', snapshot: cached, stale: true } : { kind: 'error', message }
}

async function readLedger(tz: string): Promise<LedgerState> {
  let session
  try {
    const res = await supabase.auth.getSession()
    if (res.error && !isAuthRetryableFetchError(res.error)) return { kind: 'login' }
    // A retryable error means the stored session could not be refreshed because there is no network.
    if (res.error) return fromCacheOrError('Sin conexión y sin datos guardados todavía.')
    session = res.data.session
  } catch (err) {
    console.error(JSON.stringify({ event: 'ledger_session_failed', message: String(err) }))
    return fromCacheOrError('No se pudo leer tu sesión.')
  }
  if (!session) return { kind: 'login' }

  try {
    const snapshot = await fetchSnapshot(supabase, new Date().toISOString(), tz)
    await saveSnapshot(db, snapshot)
    return { kind: 'ready', snapshot, stale: false }
  } catch (err) {
    if (isAuthFailure(err)) return { kind: 'login' }
    // No PII: only the error code/shape is logged.
    console.error(JSON.stringify({ event: 'ledger_read_failed', code: (err as { code?: unknown })?.code ?? null }))
    return fromCacheOrError('No se pudieron leer tus movimientos. Revisa tu conexión.')
  }
}

// Owner's server data for Inicio: signed-in read, offline cache fallback, refreshed every minute and on focus.
export function useLedger(tz: string): LedgerState {
  const [state, setState] = useState<LedgerState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    let inFlight = false
    const run = async () => {
      if (inFlight) return
      inFlight = true
      const next = await readLedger(tz)
      inFlight = false
      if (!cancelled) setState(next)
    }
    void run()
    const timer = setInterval(() => void run(), REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run()
    }
    document.addEventListener('visibilitychange', onVisible)
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') void run()
      if (event === 'SIGNED_OUT' && !cancelled) setState({ kind: 'login' })
    })
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      sub.subscription.unsubscribe()
    }
  }, [tz])

  return state
}
