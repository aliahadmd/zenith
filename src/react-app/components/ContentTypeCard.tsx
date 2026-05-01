import { Card, CardContent, CardHeader } from './ui/card'
import { cn } from '@/lib/utils'

type ContentTypeCardProps = {
  icon: React.ReactNode
  title: string
  description: string
  disabled?: boolean
  comingSoon?: boolean
  onClick?: () => void
}

export function ContentTypeCard({
  icon,
  title,
  description,
  disabled = false,
  comingSoon = false,
  onClick,
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
          'transition-colors',
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer hover:bg-accent hover:text-accent-foreground',
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
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="text-2xl">{icon}</div>
            <span className="font-heading text-lg font-semibold tracking-wider uppercase">
              {title}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </CardContent>
      </Card>

      {comingSoon && (
        <div className="absolute right-3 top-3">
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            Coming Soon
          </span>
        </div>
      )}
    </div>
  )
}
