import { Icon, type IconName } from './icons'

// Semana / Mes / Ingresos stay visible but disabled until their milestones (H4–H6).
const SOON: { label: string; icon: IconName }[] = [
  { label: 'Semana', icon: 'week' },
  { label: 'Mes', icon: 'month' },
  { label: 'Ingresos', icon: 'wallet' },
]

export function BottomNav() {
  const [semana, mes, ingresos] = SOON
  const soon = (item: { label: string; icon: IconName }) => (
    <button type="button" className="nav-item" disabled aria-label={`${item.label} (próximamente)`}>
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </button>
  )
  return (
    <nav className="bottom-nav" aria-label="Principal">
      <a href="#/" className="nav-item active" aria-current="page">
        <Icon name="home" />
        <span>Inicio</span>
      </a>
      {soon(semana)}
      <a href="#/captura" className="nav-fab" aria-label="Nuevo movimiento">
        <Icon name="plus" size={28} strokeWidth={2.4} />
      </a>
      {soon(mes)}
      {soon(ingresos)}
    </nav>
  )
}
