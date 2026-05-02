import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  BadgeDollarSign,
  ChartNoAxesColumnIncreasing,
  Layers3,
  PlayCircle,
  Sparkles,
  Users,
} from 'lucide-react'
import { cn } from '../lib/utils'

type AuthPageShellProps = {
  children: ReactNode
  description: string
  footer: ReactNode
  mode: 'login' | 'register'
  title: string
}

const featureItems = [
  {
    icon: Layers3,
    title: 'Publish',
    description: 'Drop posts, long-form drops, and subscriber-only updates into one studio.',
  },
  {
    icon: Users,
    title: 'Subscribe',
    description: 'Let fans follow free trials, paid memberships, and creator feeds.',
  },
  {
    icon: BadgeDollarSign,
    title: 'Earn',
    description: 'Track paid members, subscription revenue, and Stripe payout readiness.',
  },
]

export function AuthPageShell({ children, description, footer, mode, title }: AuthPageShellProps) {
  const supportingCopy =
    mode === 'register'
      ? 'Create your account, follow creators, and upgrade into a publishing studio when you are ready.'
      : 'Jump back into your creator studio, subscriptions, feed, and subscriber relationships.'

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <AuthBackground />

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_28rem] lg:px-10">
        <section className="hidden min-h-[38rem] flex-col justify-between gap-8 lg:flex">
          <div className="auth-fade-up flex max-w-2xl flex-col gap-6">
            <Link to="/login" className="inline-flex w-fit items-center gap-3 text-sm font-semibold">
              <span className="flex size-10 items-center justify-center rounded-md border bg-card shadow-sm">
                <Sparkles aria-hidden="true" />
              </span>
              Creator Network
            </Link>

            <div className="flex flex-col gap-4">
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-normal text-balance">
                Build a paid community around the work only you can make.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                A subscription-first social workspace for creators publishing premium content and subscribers
                collecting the people they care about in one feed.
              </p>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <AuthIllustration />

            <div className="auth-fade-up flex flex-col justify-end gap-3 [animation-delay:120ms]">
              {featureItems.map((item) => {
                const Icon = item.icon

                return (
                  <div
                    key={item.title}
                    className="flex min-h-24 items-start gap-3 border bg-card/70 p-4 shadow-sm backdrop-blur"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
                      <Icon aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="auth-fade-up mx-auto flex w-full max-w-md flex-col gap-5 [animation-delay:80ms]">
          <div className="flex flex-col gap-4 lg:hidden">
            <Link to="/login" className="inline-flex w-fit items-center gap-3 text-sm font-semibold">
              <span className="flex size-10 items-center justify-center rounded-md border bg-card shadow-sm">
                <Sparkles aria-hidden="true" />
              </span>
              Creator Network
            </Link>
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-semibold leading-tight tracking-normal text-balance">
                Built for creators and subscribers.
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">{supportingCopy}</p>
            </div>
          </div>

          <div className="border bg-card/90 p-5 shadow-lg shadow-foreground/5 backdrop-blur sm:p-6">
            <div className="mb-6 flex flex-col gap-2">
              <p className="text-2xl font-semibold leading-tight">{title}</p>
              <p className="text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
            {children}
          </div>

          {footer}
        </section>
      </div>
    </main>
  )
}

function AuthBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="auth-grid absolute inset-0 opacity-70" />
      <svg
        className="auth-float absolute -right-24 top-8 hidden h-[34rem] w-[42rem] text-primary/10 lg:block"
        viewBox="0 0 672 544"
        fill="none"
      >
        <path
          className="auth-path-draw"
          d="M78 136C174 44 308 72 376 170C443 267 566 226 618 134"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          className="auth-path-draw [animation-delay:140ms]"
          d="M48 372C126 278 254 300 330 388C408 478 536 454 628 330"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          className="auth-path-draw [animation-delay:280ms]"
          d="M142 92L248 206L168 328L316 438L454 318L554 400"
          stroke="currentColor"
          strokeWidth="2"
        />
        <rect x="96" y="114" width="112" height="76" rx="12" className="fill-card stroke-current" />
        <rect x="382" y="144" width="132" height="88" rx="14" className="fill-card stroke-current" />
        <rect x="170" y="326" width="126" height="86" rx="14" className="fill-card stroke-current" />
        <rect x="446" y="350" width="120" height="76" rx="12" className="fill-card stroke-current" />
        <circle cx="248" cy="206" r="9" className="fill-primary" />
        <circle cx="454" cy="318" r="9" className="fill-primary" />
      </svg>
    </div>
  )
}

function AuthIllustration() {
  return (
    <div className="auth-fade-up relative min-h-[24rem] overflow-hidden border bg-card/70 p-6 shadow-sm backdrop-blur [animation-delay:60ms]">
      <div className="absolute inset-0 auth-grid opacity-40" aria-hidden="true" />
      <div className="relative flex h-full flex-col justify-between gap-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Creator studio</p>
            <p className="max-w-xs text-sm leading-6 text-muted-foreground">
              Draft, publish, and turn audience momentum into a repeatable subscription engine.
            </p>
          </div>
          <div className="flex size-12 items-center justify-center rounded-md border bg-background">
            <PlayCircle aria-hidden="true" />
          </div>
        </div>

        <svg className="auth-float h-48 w-full text-foreground" viewBox="0 0 560 210" fill="none">
          <path
            className="auth-path-draw"
            d="M36 146C112 76 185 76 256 134C328 192 418 172 522 58"
            stroke="currentColor"
            strokeOpacity="0.24"
            strokeWidth="2"
          />
          <g className="text-primary">
            <rect x="24" y="36" width="132" height="106" rx="12" className="fill-background stroke-current" />
            <rect x="46" y="58" width="72" height="12" rx="6" className="fill-current opacity-80" />
            <rect x="46" y="84" width="88" height="8" rx="4" className="fill-current opacity-30" />
            <rect x="46" y="102" width="62" height="8" rx="4" className="fill-current opacity-20" />
          </g>
          <g className="text-primary">
            <rect x="214" y="84" width="132" height="98" rx="12" className="fill-background stroke-current" />
            <circle cx="244" cy="120" r="16" className="fill-current opacity-80" />
            <rect x="272" y="110" width="48" height="10" rx="5" className="fill-current opacity-35" />
            <rect x="272" y="132" width="36" height="8" rx="4" className="fill-current opacity-20" />
          </g>
          <g className="text-primary">
            <rect x="404" y="40" width="132" height="112" rx="12" className="fill-background stroke-current" />
            <path d="M434 118V86" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
            <path d="M470 118V70" stroke="currentColor" strokeWidth="8" strokeLinecap="round" opacity="0.7" />
            <path d="M506 118V98" stroke="currentColor" strokeWidth="8" strokeLinecap="round" opacity="0.4" />
          </g>
        </svg>

        <div className="grid grid-cols-3 gap-3">
          {[
            ['Creators', 'Studio'],
            ['Members', 'Feed'],
            ['Revenue', 'Payouts'],
          ].map(([label, value]) => (
            <div key={label} className="border bg-background/80 p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border bg-background/80 p-4">
          <ChartNoAxesColumnIncreasing aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Audience signal</p>
            <p className="text-sm text-muted-foreground">Subscription activity and feed engagement stay visible.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AuthFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('border bg-card/80 px-5 py-4 text-center text-sm text-muted-foreground backdrop-blur', className)}>
      {children}
    </div>
  )
}
