import { Icon, type IconName } from './icons'

type Tab = 'home' | 'week' | 'month' | 'incomes'

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
      <Tab href="#/semana" label="Semana" icon="week" on={active === 'week'} />
      <a href="#/captura" className="nav-fab" aria-label="Nuevo movimiento">
        <Icon name="plus" size={28} strokeWidth={2.4} />
      </a>
      <Tab href="#/mes" label="Mes" icon="month" on={active === 'month'} />
      <Tab href="#/ingresos" label="Ingresos" icon="wallet" on={active === 'incomes'} />
    </nav>
  )
}
