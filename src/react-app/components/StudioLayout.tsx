import type { ReactNode } from 'react'
import { cn } from '../lib/utils'
import { StudioNav } from './StudioNav'

type StudioLayoutProps = {
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  description: string
  title: string
}

export function StudioLayout({
  action,
  children,
  className,
  contentClassName,
  description,
  title,
}: StudioLayoutProps) {
  return (
    <div className={cn('mx-auto w-full max-w-7xl', className)}>
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
        <StudioNav className="hidden lg:block lg:sticky lg:top-8" orientation="vertical" />

        <div className={cn('flex min-w-0 flex-col gap-6', contentClassName)}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
            {action && <div className="flex shrink-0 flex-col gap-2 sm:items-end">{action}</div>}
          </div>

          <StudioNav className="lg:hidden" orientation="horizontal" />

          {children}
        </div>
      </div>
    </div>
  )
}
