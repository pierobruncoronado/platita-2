import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../db/db'
import { RECURRING_TEMPLATES } from '../domain/catalog'
import { generateExpected, openExpected } from '../domain/expected'
import { balanceAt } from '../domain/flow'
import { isClosedToday, streakAt, weekCloses } from '../domain/streak'
import { daySpend, sundayProjection, weekIncomeCents, weekSpend } from '../domain/week'
import type { AppSettings } from './App'

// Everything Inicio and Semana show about the current week, from one live read of movements.
export function useWeekView(settings: AppSettings, now: string) {
  const { tz, opening } = settings
  const movements = useLiveQuery(() => db.movements.toArray(), [])
  const closes = useLiveQuery(() => db.closes.toArray(), [])
  return useMemo(() => {
    if (!movements || !closes) return null
    const closedDays = closes.map((c) => c.day)
    const balance = balanceAt(movements, now, tz, opening)
    const open = openExpected(generateExpected(RECURRING_TEMPLATES, now, tz), movements, now)
    const owedCents = open.reduce((sum, x) => sum + x.status.remainingCents, 0)
    return {
      movements,
      balance,
      open,
      owedCents,
      spend: weekSpend(movements, balance.weekId, tz, opening),
      days: daySpend(movements, balance.weekId, tz, opening),
      incomeCents: weekIncomeCents(movements, balance.weekId, tz, opening),
      projection: sundayProjection(balance.weeklyNetCents, owedCents),
      streak: streakAt(closedDays, now, tz),
      closedToday: isClosedToday(closedDays, now, tz),
      weekCloses: weekCloses(closedDays, now, tz, opening.at),
    }
  }, [movements, closes, now, tz, opening])
}
