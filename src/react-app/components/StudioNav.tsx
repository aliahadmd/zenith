import { Link, useRouterState } from '@tanstack/react-router'
import { BookOpen, CalendarClock, Camera, CreditCard, GraduationCap, Headphones, LayoutDashboard, WalletCards, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'

type StudioNavItem = {
  to: '/studio' | '/studio/scheduled' | '/studio/articles/new' | '/studio/photography' | '/studio/audio' | '/studio/courses' | '/studio/subscriptions' | '/studio/payouts'
  label: string
  icon: LucideIcon
}

const studioNavItems: StudioNavItem[] = [
  { to: '/studio', label: 'Create', icon: LayoutDashboard },
  { to: '/studio/scheduled', label: 'Scheduled', icon: CalendarClock },
  { to: '/studio/articles/new', label: 'Articles', icon: BookOpen },
  { to: '/studio/photography', label: 'Photography', icon: Camera },
  { to: '/studio/audio', label: 'Audio', icon: Headphones },
  { to: '/studio/courses', label: 'Courses', icon: GraduationCap },
  { to: '/studio/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/studio/payouts', label: 'Money', icon: WalletCards },
]

type StudioNavProps = {
  className?: string
  orientation?: 'horizontal' | 'vertical'
}

export function StudioNav({ className, orientation = 'horizontal' }: StudioNavProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const vertical = orientation === 'vertical'

  return (
    <nav
      aria-label="Studio sections"
      className={cn(vertical ? 'self-start' : 'overflow-x-auto', className)}
    >
      <div
        className={cn(
          vertical
            ? 'flex min-h-[calc(100vh-4rem)] flex-col border-r pr-4'
            : 'inline-flex min-h-11 min-w-full items-center gap-1 rounded-md border bg-card p-1 sm:min-w-0',
        )}
      >
        {vertical && (
          <div className="px-3 pb-3">
            <p className="text-sm font-semibold">Studio</p>
            <p className="mt-1 text-xs text-muted-foreground">Creator workspace</p>
          </div>
        )}

        <div className={cn(vertical ? 'flex flex-col gap-1' : 'contents')}>
        {studioNavItems.map((item) => {
          const Icon = item.icon
          const active = pathname === item.to || (item.to === '/studio/articles/new' && pathname.startsWith('/studio/articles/')) || (item.to === '/studio/courses' && pathname.startsWith('/studio/courses'))

          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                vertical
                  ? 'flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors'
                  : 'inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-sm px-3 text-sm font-medium transition-colors sm:px-4',
                active
                  ? vertical
                    ? 'bg-accent text-accent-foreground shadow-sm ring-1 ring-border/60'
                    : 'bg-background text-foreground shadow-sm ring-1 ring-border/60'
                  : vertical
                    ? 'text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground'
                    : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
              )}
            >
              <Icon data-icon="inline-start" />
              {item.label}
            </Link>
          )
        })}
        </div>
      </div>
    </nav>
  )
}
