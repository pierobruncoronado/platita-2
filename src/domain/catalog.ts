// Capture taxonomy (spec §4 "Capture taxonomy") and quick tiles (spec §2).
// Colors are the frozen category tokens; they never mean status.
import type { RecurringTemplate } from './expected'

export type CategoryId = 'transporte' | 'comida' | 'bebidas' | 'alcohol' | 'otros'

export interface Category {
  id: CategoryId
  label: string
  color: string
  subtypes: string[] // optional detail row; empty = no second row
}

// Detail of Otros that marks Claude's monthly charge; Semana keeps it out of the hormigas charts.
export const CLAUDE_SUBTYPE = 'Claude'

export const CATEGORIES: Category[] = [
  { id: 'transporte', label: 'Transporte', color: '#FF8A3D', subtypes: ['Pasaje', 'Taxi'] },
  { id: 'comida', label: 'Comida', color: '#FF5CA8', subtypes: ['Snack', 'Menú'] },
  { id: 'bebidas', label: 'Bebidas', color: '#3FD6E6', subtypes: [] },
  { id: 'alcohol', label: 'Alcohol', color: '#A878FF', subtypes: [] },
  { id: 'otros', label: 'Otros', color: '#7F8AA0', subtypes: [CLAUDE_SUBTYPE] },
]

export function categoryById(id: string | null): Category | undefined {
  return CATEGORIES.find((c) => c.id === id)
}

export type TileIcon = 'bus' | 'cup' | 'snack' | 'taxi' | 'glass'

export interface QuickTile {
  id: string
  label: string
  amountCents: number // default only; editable defaults are a v1 gap
  category: CategoryId
  subtype: string | null
  icon: TileIcon
}

// One-off income sources (spec §4 "Ingreso suelto").
export const INCOME_SOURCES = ['Papá', 'Abuelo', 'Hermana', 'Abuela', 'Otro']

// The two recurring incomes (spec §4). Mesada counts from the opening balance;
// Claude's October instance is generated so its pre-opening partial payment is tracked.
export const RECURRING_TEMPLATES: RecurringTemplate[] = [
  {
    id: 'mesada-papa',
    label: 'Mesada papá',
    shortLabel: 'Mesada',
    windowLabel: 'de lun a jue',
    amountCents: 10000,
    cadence: { kind: 'weekly', windowDays: 4 },
    activeFrom: '2026-10-15T19:31:00.000Z',
  },
  {
    id: 'reposicion-claude',
    label: 'Reposición Claude',
    shortLabel: 'Claude',
    windowLabel: 'entre el 7 y el 14',
    amountCents: 8000,
    cadence: { kind: 'monthly', fromDay: 7, toDay: 14 },
    activeFrom: '2026-10-01T05:00:00.000Z',
  },
]

// Order and defaults from the Inicio board.
export const QUICK_TILES: QuickTile[] = [
  { id: 'pasaje', label: 'Pasaje', amountCents: 200, category: 'transporte', subtype: 'Pasaje', icon: 'bus' },
  { id: 'bebida', label: 'Bebida', amountCents: 300, category: 'bebidas', subtype: null, icon: 'cup' },
  { id: 'snack', label: 'Snack', amountCents: 700, category: 'comida', subtype: 'Snack', icon: 'snack' },
  { id: 'taxi', label: 'Taxi', amountCents: 1000, category: 'transporte', subtype: 'Taxi', icon: 'taxi' },
  { id: 'alcohol', label: 'Alcohol', amountCents: 2500, category: 'alcohol', subtype: null, icon: 'glass' },
]
