import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js'

// Spanish, never raw server text. No email/password ever reaches the logs.
export function loginErrorMessage(err: unknown): string {
  if (isAuthRetryableFetchError(err) || err instanceof TypeError) return 'Sin conexión. Revisa tu internet e intenta otra vez.'
  if (isAuthApiError(err)) {
    if (err.status === 429 || err.code === 'over_request_rate_limit') return 'Demasiados intentos. Espera unos minutos y prueba otra vez.'
    if (err.code === 'invalid_credentials' || err.status === 400) return 'Correo o contraseña incorrectos.'
  }
  return 'No se pudo iniciar sesión. Intenta otra vez.'
}
