import { useRegisterSW } from 'virtual:pwa-register/react'

const CHECK_EVERY_MS = 60 * 60 * 1000

// A new deploy never reloads the app by itself (it could wipe an entry being typed):
// the waiting service worker is announced here and applied on tap.
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {}) // offline or server down: try later
      }
      setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
    onRegisterError(err) {
      console.error(JSON.stringify({ event: 'sw_register_failed', message: String(err) }))
    },
  })

  if (!needRefresh) return null
  return (
    <div className="update-banner" role="status" aria-live="polite">
      <span>Hay una versión nueva</span>
      <button type="button" className="btn-green" onClick={() => updateServiceWorker()}>
        Actualizar
      </button>
    </div>
  )
}
