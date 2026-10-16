import { useCallback, useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'capture'; id: string | null }
  | { name: 'incomes' }
  | { name: 'week' }
  | { name: 'month' }
  | { name: 'income'; id: string | null; expectedId: string | null }

function parseHash(hash: string): Route {
  let match = /^#\/captura(?:\/([\w-]+))?$/.exec(hash)
  if (match) return { name: 'capture', id: match[1] ?? null }
  if (hash === '#/ingresos') return { name: 'incomes' }
  if (hash === '#/semana') return { name: 'week' }
  if (hash === '#/mes') return { name: 'month' }
  match = /^#\/ingreso(?:\/([\w-]+))?$/.exec(hash)
  if (match) return { name: 'income', id: match[1] ?? null, expectedId: null }
  match = /^#\/confirmar\/(.+)$/.exec(hash)
  if (match) {
    try {
      return { name: 'income', id: null, expectedId: decodeURIComponent(match[1]) }
    } catch {
      return { name: 'home' } // malformed link: fall back instead of crashing the app
    }
  }
  return { name: 'home' }
}

// The last list screen the user was on; forms return there when they close.
let lastList: Route = { name: 'home' }

export function returnRoute(): Route {
  return lastList
}

function hashOf(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'capture':
      return route.id ? `#/captura/${route.id}` : '#/captura'
    case 'incomes':
      return '#/ingresos'
    case 'week':
      return '#/semana'
    case 'month':
      return '#/mes'
    case 'income':
      if (route.expectedId) return `#/confirmar/${encodeURIComponent(route.expectedId)}`
      return route.id ? `#/ingreso/${route.id}` : '#/ingreso'
  }
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
  useEffect(() => {
    if (route.name === 'home' || route.name === 'incomes' || route.name === 'week' || route.name === 'month') lastList = route
  }, [route])
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
