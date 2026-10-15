// Stroke icons copied from the design boards (docs/design-reference).
import type { TileIcon } from '../domain/catalog'

const PATHS: Record<TileIcon | 'plus' | 'close' | 'back' | 'home' | 'week' | 'month' | 'wallet', string[]> = {
  bus: ['M7 3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z', 'M4 11h16M8 21v-4M16 21v-4'],
  cup: ['M7 3h10l-1.5 17a2 2 0 0 1-2 1.8h-3a2 2 0 0 1-2-1.8z', 'M6.5 8h11'],
  snack: ['M3 17a9 7 0 0 1 18 0z', 'M8 13l1 2M12 12v3M16 13l-1 2'],
  taxi: ['M5 16l1.5-5a2 2 0 0 1 2-1.5h7a2 2 0 0 1 2 1.5L19 16', 'M5 16h14a2 2 0 0 1 0 4H5a2 2 0 0 1 0-4z', 'M9 9V7h6v2'],
  glass: ['M6 3h12l-6 9z', 'M12 12v8M8 20h8'],
  plus: ['M12 5v14M5 12h14'],
  close: ['M6 6l12 12M18 6L6 18'],
  back: ['M9 6h11v12H9l-6-6z', 'M13 10l4 4M17 10l-4 4'],
  home: ['M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  week: ['M5 20V10M12 20V4M19 20v-7'],
  month: ['M12 3v9h9', 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0'],
  wallet: ['M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z', 'M3 7l12-3v3'],
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 24, strokeWidth = 2 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
