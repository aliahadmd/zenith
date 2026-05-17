import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { Button } from './ui/button'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex gap-1 rounded-full border bg-card/60 p-1">
      <Button
        variant={theme === 'light' ? 'secondary' : 'ghost'}
        size="icon"
        onClick={() => setTheme('light')}
        aria-label="Light theme"
      >
        <Sun data-icon="inline-start" />
      </Button>
      <Button
        variant={theme === 'dark' ? 'secondary' : 'ghost'}
        size="icon"
        onClick={() => setTheme('dark')}
        aria-label="Dark theme"
      >
        <Moon data-icon="inline-start" />
      </Button>
      <Button
        variant={theme === 'system' ? 'secondary' : 'ghost'}
        size="icon"
        onClick={() => setTheme('system')}
        aria-label="System theme"
      >
        <Monitor data-icon="inline-start" />
      </Button>
    </div>
  )
}
