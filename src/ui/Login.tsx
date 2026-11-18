import { useState, type FormEvent } from 'react'
import { loginErrorMessage } from '../data/authMessages'
import { supabase } from '../data/ledgerClient'

// Single-owner sign-in (email + password). There is deliberately no sign-out button in this milestone.
export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!email.trim() || !password) {
      setMessage('Escribe tu correo y tu contraseña.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      // On success the SIGNED_IN event makes useLedger read the data and replace this screen.
    } catch (err) {
      console.error(JSON.stringify({ event: 'login_failed', status: (err as { status?: unknown })?.status ?? null }))
      setMessage(loginErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form className="card login-card" onSubmit={submit} aria-label="Iniciar sesión" data-testid="login">
      <p className="eyebrow">Tus movimientos</p>
      <p className="login-sub">Inicia sesión para ver tu saldo y tus gastos reales.</p>
      <label className="login-field">
        <span>Correo</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="login-field">
        <span>Contraseña</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {message && (
        <p className="error small" role="alert">
          {message}
        </p>
      )}
      <button type="submit" className="btn-green login-submit" disabled={busy}>
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
