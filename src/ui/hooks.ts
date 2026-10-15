import { useCallback, useEffect, useState } from 'react'

export type Route = { name: 'home' } | { name: 'capture'; id: string | null }

function parseHash(hash: string): Route {
  const match = /^#\/captura(?:\/([\w-]+))?$/.exec(hash)
  if (match) return { name: 'capture', id: match[1] ?? null }
  return { name: 'home' }
}

function hashOf(route: Route): string {
  return route.name === 'home' ? '#/' : route.id ? `#/captura/${route.id}` : '#/captura'
}

export function navigate(route: Route): void {
  window.location.hash = hashOf(route)
}

// Leaving a form: replace the entry so Android "back" does not reopen it.
export function replaceRoute(route: Route): void {
  window.location.replace(hashOf(route))
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

// Current instant, refreshed periodically so week/day boundaries roll over while open.
// `refresh` lets a write (e.g. a tile tap at 00:00:05) re-evaluate the period immediately.
export function useNow(intervalMs = 30_000): [string, () => void] {
  const [now, setNow] = useState(() => new Date().toISOString())
  const refresh = useCallback(() => setNow(new Date().toISOString()), [])
  useEffect(() => {
    const id = setInterval(refresh, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, refresh])
  return [now, refresh]
}
