import { Link, useRouterState } from '@tanstack/react-router'
import {
  BadgePlus,
  LayoutDashboard,
  type LucideIcon,
  LogOut,
  Rss,
  Settings,
  User,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { ThemeSwitcher } from './ThemeSwitcher'

type SidebarProps = {
  className?: string
  onNavigate?: () => void
}

type NavItem = {
  to: '/feed' | '/settings' | '/become-creator' | '/studio'
  label: string
  icon: LucideIcon
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const { currentUser, logout } = useAuth()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  const navLinkClass = (href: string) =>
    cn(
      'flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
      pathname === href
        ? 'bg-accent text-accent-foreground shadow-sm ring-1 ring-border/60'
        : 'text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground',
    )

  const navItems: NavItem[] = [
    ...(currentUser?.role === 'subscriber'
      ? [
          { to: '/feed' as const, label: 'Feed', icon: Rss },
          { to: '/become-creator' as const, label: 'Become Creator', icon: BadgePlus },
        ]
      : []),
    ...(currentUser?.role === 'creator'
      ? [
          { to: '/feed' as const, label: 'Feed', icon: Rss },
          { to: '/studio' as const, label: 'Studio', icon: LayoutDashboard },
        ]
      : []),
    { to: '/settings' as const, label: 'Settings', icon: Settings },
  ]

  async function handleLogout() {
    await logout()
    onNavigate?.()
  }

  return (
    <aside className={cn('fixed left-0 top-0 flex h-screen w-64 flex-col border-r bg-background p-4', className)}>
      {/* User info */}
      <div className="flex items-center gap-3 pb-4">
        <Avatar>
          <AvatarImage src={currentUser?.avatarUrl ?? undefined} alt={currentUser?.displayName} />
          <AvatarFallback>
            {currentUser?.displayName?.slice(0, 2).toUpperCase() ?? 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{currentUser?.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">@{currentUser?.username}</p>
        </div>
      </div>

      <Separator className="mb-4" />

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1">
        <Link
          to="/u/$username"
          params={{ username: currentUser?.username ?? '' }}
          className={navLinkClass(`/u/${currentUser?.username ?? ''}`)}
          onClick={onNavigate}
        >
          <User data-icon="inline-start" />
          Profile
        </Link>
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.to} to={item.to} className={navLinkClass(item.to)} onClick={onNavigate}>
              <Icon data-icon="inline-start" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="flex flex-col gap-3">
        <ThemeSwitcher />

        <Separator />

        {/* Logout */}
        <Button variant="ghost" className="min-h-10 w-full justify-start gap-3 px-3" onClick={handleLogout}>
          <LogOut data-icon="inline-start" />
          Logout
        </Button>
      </div>
    </aside>
  )
}
