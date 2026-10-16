import { dayKey } from '../domain/streak'
import type { PlatitaDB } from './db'

// Closes TODAY (civil day in tz). Idempotent: closing twice keeps the first closedAt.
// Only today can be closed (spec §4): the day key always comes from `now`, never from the caller.
export async function closeToday(db: PlatitaDB, now: string, tz: string): Promise<string> {
  const day = dayKey(now, tz)
  await db.transaction('rw', db.closes, async () => {
    if (!(await db.closes.get(day))) await db.closes.add({ day, closedAt: now })
  })
  return day
}
