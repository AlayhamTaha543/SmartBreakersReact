import { Menu, PlugZap, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'

type AppShellProps = {
  title: string
  subtitle?: string
  status?: ReactNode
  actions?: ReactNode
  children: ReactNode
  maxWidth?: 'wide' | 'standard'
  hideContext?: boolean
}

const navigation = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/scenarios', label: 'Scenario Lab', end: false },
  { to: '/configuration', label: 'Configuration', end: false },
]

function Navigation({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  return <nav
    aria-label={mobile ? 'Mobile simulator navigation' : 'Simulator navigation'}
    className={mobile ? 'grid gap-1' : 'hidden items-center gap-1 lg:flex'}
  >
    {navigation.map((item) => <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) => 'shell-nav-link' + (isActive ? ' shell-nav-link-active' : '')}
    >
      {item.label}
    </NavLink>)}
  </nav>
}

export function AppShell({
  title,
  subtitle,
  status,
  actions,
  children,
  maxWidth = 'wide',
  hideContext = false,
}: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const widthClass = maxWidth === 'standard' ? 'max-w-[1500px]' : 'max-w-[1800px]'

  return <div className="min-h-screen bg-surface text-ink">
    <header className="sticky top-0 z-40 border-b border-outline bg-surface/95 shadow-sm backdrop-blur-xl">
      <div className={'mx-auto flex min-h-16 items-center gap-3 px-4 py-2 ' + widthClass}>
        <NavLink aria-label="SmartBreaker dashboard" className="group flex min-w-0 items-center gap-3" to="/" onClick={() => setMenuOpen(false)}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-strong to-secondary text-on-primary shadow-active transition group-hover:brightness-110">
            <PlugZap size={21} />
          </span>
          <span className="hidden min-w-0 sm:block">
            <strong className="block truncate text-base font-bold leading-5 transition group-hover:text-primary">SmartBreaker</strong>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Control center</span>
          </span>
        </NavLink>
        <div className="mx-auto hidden lg:block"><Navigation /></div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden xl:block">{status}</div>
          <ThemeToggle />
          <div className={hideContext ? 'flex' : 'hidden sm:flex lg:hidden xl:flex'}>{actions}</div>
          <button
            type="button"
            className="icon-button border border-outline bg-surface-high lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>
      {hideContext
        ? <h1 className="sr-only">{title}</h1>
        : <div className="border-t border-outline/70 bg-surface-low/70">
          <div className={'mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 ' + widthClass}>
            <div className="w-full min-w-0 sm:w-auto">
              <h1 className="truncate text-sm font-semibold sm:text-base">{title}</h1>
              {subtitle && <p className="mt-0.5 text-[11px] leading-4 text-muted">{subtitle}</p>}
            </div>
            <div className="hidden min-w-0 flex-1 items-center justify-end gap-2 sm:flex xl:hidden">{status}</div>
            <div className="flex w-full items-center justify-end sm:hidden">{actions}</div>
          </div>
        </div>}
      {menuOpen && <div id="mobile-navigation" className="border-t border-outline bg-surface-container p-3 lg:hidden">
        <Navigation mobile onNavigate={() => setMenuOpen(false)} />
      </div>}
    </header>
    {children}
  </div>
}
