import { Icon, type IconName } from './icons'

type Tab = 'home' | 'incomes'

// Semana / Mes stay visible but disabled until their milestones (H5–H6).
function Soon({ label, icon }: { label: string; icon: IconName }) {
  return (
    <button type="button" className="nav-item" disabled aria-label={`${label} (próximamente)`}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  )
}

function Tab({ href, label, icon, on }: { href: string; label: string; icon: IconName; on: boolean }) {
  return (
    <a href={href} className={`nav-item ${on ? 'active' : ''}`} aria-current={on ? 'page' : undefined}>
      <Icon name={icon} />
      <span>{label}</span>
    </a>
  )
}

export function BottomNav({ active }: { active: Tab }) {
  return (
    <nav className="bottom-nav" aria-label="Principal">
      <Tab href="#/" label="Inicio" icon="home" on={active === 'home'} />
      <Soon label="Semana" icon="week" />
      <a href="#/captura" className="nav-fab" aria-label="Nuevo movimiento">
        <Icon name="plus" size={28} strokeWidth={2.4} />
      </a>
      <Soon label="Mes" icon="month" />
      <Tab href="#/ingresos" label="Ingresos" icon="wallet" on={active === 'incomes'} />
    </nav>
  )
}
