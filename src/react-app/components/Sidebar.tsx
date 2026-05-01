import { Link, useRouterState } from '@tanstack/react-router'
import { cn } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { ThemeSwitcher } from './ThemeSwitcher'

export function Sidebar() {
  const { currentUser, logout } = useAuth()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  const navLinkClass = (href: string) =>
    cn(
      'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
      pathname === href
        ? 'bg-accent text-accent-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    )

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-64 flex-col border-r bg-background p-4">
      {/* User info */}
      <div className="flex items-center gap-3 pb-4">
        <Avatar>
          <AvatarImage src={currentUser?.avatarUrl ?? undefined} alt={currentUser?.displayName} />
          <AvatarFallback>
            {currentUser?.displayName?.slice(0, 2).toUpperCase() ?? 'U'}
          </AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-semibold">{currentUser?.displayName}</span>
      </div>

      <Separator className="mb-4" />

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1">
        {currentUser?.role === 'subscriber' && (
          <Link to="/feed" className={navLinkClass('/feed')}>
            Feed
          </Link>
        )}
        <Link
          to="/u/$username"
          params={{ username: currentUser?.username ?? '' }}
          className={navLinkClass(`/u/${currentUser?.username ?? ''}`)}
        >
          Profile
        </Link>
        <Link to="/settings" className={navLinkClass('/settings')}>
          Settings
        </Link>
        {currentUser?.role === 'subscriber' && (
          <Link to="/become-creator" className={navLinkClass('/become-creator')}>
            Become Creator
          </Link>
        )}
        {currentUser?.role === 'creator' && (
          <Link to="/studio" className={navLinkClass('/studio')}>
            Studio
          </Link>
        )}
      </nav>

      <ThemeSwitcher />

      <Separator className="my-4" />

      {/* Logout */}
      <Button variant="ghost" className="w-full justify-start" onClick={logout}>
        Logout
      </Button>
    </aside>
  )
}
