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
      'relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-[15px] font-medium transition-colors before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-transparent',
      pathname === href
        ? 'bg-transparent text-foreground before:bg-primary'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
    )

  const roleNavItems: NavItem[] =
    currentUser?.role === 'subscriber'
      ? [
          { to: '/feed' as const, label: 'Feed', icon: Rss },
          { to: '/become-creator' as const, label: 'Become Creator', icon: BadgePlus },
        ]
      : currentUser?.role === 'creator'
        ? [
            { to: '/feed' as const, label: 'Feed', icon: Rss },
            { to: '/studio' as const, label: 'Studio', icon: LayoutDashboard },
          ]
        : []

  const [feedNavItem, ...secondaryNavItems] = roleNavItems
  const settingsNavItem: NavItem = { to: '/settings' as const, label: 'Settings', icon: Settings }
  const FeedIcon = feedNavItem?.icon

  async function handleLogout() {
    await logout()
    onNavigate?.()
  }

  return (
    <aside className={cn('fixed left-0 top-0 flex h-screen w-72 flex-col border-r bg-background p-4', className)}>
      {/* User info */}
      <div className="flex items-center gap-3 pb-4">
        <Avatar className="size-11">
          <AvatarImage src={currentUser?.avatarUrl ?? undefined} alt={currentUser?.displayName} />
          <AvatarFallback>
            {currentUser?.displayName?.slice(0, 2).toUpperCase() ?? 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight">{currentUser?.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">@{currentUser?.username}</p>
        </div>
      </div>

      <Separator className="mb-4" />

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1.5">
        {feedNavItem && FeedIcon ? (
          <Link to={feedNavItem.to} className={navLinkClass(feedNavItem.to)} onClick={onNavigate}>
            <FeedIcon data-icon="inline-start" />
            {feedNavItem.label}
          </Link>
        ) : null}
        <Link
          to="/u/$username"
          params={{ username: currentUser?.username ?? '' }}
          className={navLinkClass(`/u/${currentUser?.username ?? ''}`)}
          onClick={onNavigate}
        >
          <User data-icon="inline-start" />
          Profile
        </Link>
        {[...secondaryNavItems, settingsNavItem].map((item) => {
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
        <Button variant="ghost" className="min-h-11 w-full justify-start gap-3 px-3 text-muted-foreground hover:text-foreground" onClick={handleLogout}>
          <LogOut data-icon="inline-start" />
          Logout
        </Button>
      </div>
    </aside>
  )
}
