import { Card, CardContent } from './ui/card'
import { cn } from '@/lib/utils'
import { ArrowUpRight } from 'lucide-react'

type ContentTone = 'blue' | 'emerald' | 'amber' | 'rose' | 'violet'

type ContentTypeCardProps = {
  icon: React.ReactNode
  title: string
  description: string
  disabled?: boolean
  comingSoon?: boolean
  onClick?: () => void
  tone?: ContentTone
}

const toneClasses: Record<ContentTone, string> = {
  blue: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
}

export function ContentTypeCard({
  icon,
  title,
  description,
  disabled = false,
  comingSoon = false,
  onClick,
  tone = 'blue',
}: ContentTypeCardProps) {
  const handleClick = () => {
    if (!disabled && onClick) {
      onClick()
    }
  }

  return (
    <div className="relative">
      <Card
        className={cn(
          'interactive-surface gap-0 rounded-lg border bg-card text-left shadow-none ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          disabled
            ? 'cursor-not-allowed opacity-50'
            : 'content-type-card cursor-pointer hover:border-primary/35 hover:bg-accent/45',
        )}
        onClick={handleClick}
        role={disabled ? undefined : 'button'}
        tabIndex={disabled ? undefined : 0}
        onKeyDown={
          disabled
            ? undefined
            : (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onClick?.()
                }
              }
        }
        aria-disabled={disabled}
      >
        <CardContent className="flex min-h-32 items-start gap-4 p-5">
          <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg', toneClasses[tone])}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold tracking-normal">{title}</p>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          {!disabled && <ArrowUpRight data-content-type-arrow className="content-type-card-arrow mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        </CardContent>
      </Card>

      {comingSoon && (
        <div className="absolute right-3 top-3">
          <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Coming Soon
          </span>
        </div>
      )}
    </div>
  )
}
