import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { Button } from './ui/button'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex gap-1">
      <Button
        variant={theme === 'light' ? 'secondary' : 'ghost'}
        size="icon"
        onClick={() => setTheme('light')}
        aria-label="Light theme"
      >
        <Sun className="h-4 w-4" />
      </Button>
      <Button
        variant={theme === 'dark' ? 'secondary' : 'ghost'}
        size="icon"
        onClick={() => setTheme('dark')}
        aria-label="Dark theme"
      >
        <Moon className="h-4 w-4" />
      </Button>
      <Button
        variant={theme === 'system' ? 'secondary' : 'ghost'}
        size="icon"
        onClick={() => setTheme('system')}
        aria-label="System theme"
      >
        <Monitor className="h-4 w-4" />
      </Button>
    </div>
  )
}
