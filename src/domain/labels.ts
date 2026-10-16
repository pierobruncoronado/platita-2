// Spanish UI labels for dates, always in the configured timezone.
import {
  addDays,
  civilDateOf,
  isoWeekday,
  localDateTimeOf,
  mondayOfWeek,
  toMs,
  weekIdOf,
  zonedLocalToIso,
  type CivilDate,
} from './time'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function sameDate(a: CivilDate, b: CivilDate): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d
}

function hhmm(h: number, mi: number): string {
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// "Octubre 2026"
export function monthTitle(now: string, tz: string): string {
  const d = civilDateOf(toMs(now), tz)
  return `${MONTH_NAMES[d.m - 1]} ${d.y}`
}

// "Hasta hoy, jueves 15"
export function untilToday(now: string, tz: string): string {
  const d = civilDateOf(toMs(now), tz)
  return `Hasta hoy, ${WEEKDAYS[isoWeekday(d)].toLowerCase()} ${d.d}`
}

// "28 sep"
export function shortDate(d: CivilDate): string {
  return `${d.d} ${MONTHS[d.m - 1]}`
}

// "Jueves 15 oct"
export function dayHeader(now: string, tz: string): string {
  const d = civilDateOf(toMs(now), tz)
  return `${WEEKDAYS[isoWeekday(d)]} ${d.d} ${MONTHS[d.m - 1]}`
}

// "Semana 12–18 oct" or "Semana 26 oct–1 nov"
export function weekHeader(now: string, tz: string): string {
  const mon = mondayOfWeek(weekIdOf(now, tz))
  const sun = addDays(mon, 6)
  const start = mon.m === sun.m ? `${mon.d}` : `${mon.d} ${MONTHS[mon.m - 1]}`
  return `Semana ${start}–${sun.d} ${MONTHS[sun.m - 1]}`
}

// "13:34"
export function timeLabel(iso: string, tz: string): string {
  const t = localDateTimeOf(iso, tz)
  return hhmm(t.h, t.mi)
}

// Date/time chip: "Hoy · 13:34", "Ayer · 20:05", "12 oct · 09:00"
export function whenLabel(iso: string, now: string, tz: string): string {
  const t = localDateTimeOf(iso, tz)
  const today = civilDateOf(toMs(now), tz)
  const time = hhmm(t.h, t.mi)
  if (sameDate(t, today)) return `Hoy · ${time}`
  if (sameDate(t, addDays(today, -1))) return `Ayer · ${time}`
  return `${t.d} ${MONTHS[t.m - 1]} · ${time}`
}

// Value for <input type="datetime-local">, in tz.
export function toDateTimeInput(iso: string, tz: string): string {
  const t = localDateTimeOf(iso, tz)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.y}-${p(t.m)}-${p(t.d)}T${p(t.h)}:${p(t.mi)}`
}

// <input type="datetime-local"> value, read as wall-clock time in tz → ISO instant.
export function fromDateTimeInput(value: string, tz: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [y, m, d, h, mi] = match.slice(1).map(Number)
  return zonedLocalToIso({ y, m, d, h, mi }, tz)
}

export function isSameLocalDay(iso: string, now: string, tz: string): boolean {
  return sameDate(civilDateOf(toMs(iso), tz), civilDateOf(toMs(now), tz))
}
