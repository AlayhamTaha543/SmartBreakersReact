import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../state/ThemeContext'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const light = theme === 'light'

  return (
    <button
      className="button-secondary min-h-11 !px-3 sm:min-h-0"
      type="button"
      onClick={toggleTheme}
      aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
      title={light ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      {light ? <Moon size={15} /> : <Sun size={15} />}
      <span className="hidden sm:inline">{light ? 'Dark' : 'Light'}</span>
    </button>
  )
}
