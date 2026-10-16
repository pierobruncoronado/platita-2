const R = 52
const C = 2 * Math.PI * R

export interface Slice {
  id: string
  color: string
  cents: number
}

// Ring chart shared by Semana (hormigas) and Mes: arcs proportional to `cents`, total in the middle.
export function Donut({ slices, totalLabel, caption, testId }: { slices: Slice[]; totalLabel: string; caption: string; testId: string }) {
  const total = slices.reduce((sum, s) => sum + s.cents, 0)
  let offset = 0
  return (
    <div className="donut">
      <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
        <circle cx="66" cy="66" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="16" />
        {total > 0 &&
          slices.map((s) => {
            const len = (s.cents / total) * C
            if (len === 0) return null
            const arc = (
              <circle
                key={s.id}
                cx="66"
                cy="66"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth="16"
                strokeDasharray={`${len} ${C}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 66 66)"
              />
            )
            offset += len
            return arc
          })}
      </svg>
      <div className="donut-center">
        <span className="donut-total" data-testid={testId}>
          {totalLabel}
        </span>
        <span className="muted donut-cap">{caption}</span>
      </div>
    </div>
  )
}
