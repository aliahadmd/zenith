import { Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'

export function LoadingBlock({
  label = 'Loading',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div className={cn('flex min-h-64 flex-col items-center justify-center gap-3 text-muted-foreground', className)}>
      <Loader2 className="animate-spin" aria-hidden="true" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  )
}
