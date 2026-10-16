// Semana | Mes selector shared by both views (board: green pill on the active one).
export function PeriodToggle({ active }: { active: 'week' | 'month' }) {
  return (
    <div className="seg-toggle" role="group" aria-label="Periodo">
      <a href="#/semana" className={`seg ${active === 'week' ? 'seg-on' : ''}`} aria-current={active === 'week' ? 'page' : undefined}>
        Semana
      </a>
      <a href="#/mes" className={`seg ${active === 'month' ? 'seg-on' : ''}`} aria-current={active === 'month' ? 'page' : undefined}>
        Mes
      </a>
    </div>
  )
}
