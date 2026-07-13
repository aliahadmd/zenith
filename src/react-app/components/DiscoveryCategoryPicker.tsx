import { Check } from 'lucide-react'
import type { DiscoveryCategory } from '../lib/discovery'
import { cn } from '../lib/utils'

export function DiscoveryCategoryPicker({
  categories,
  selected,
  maximum,
  onChange,
  label,
}: {
  categories: DiscoveryCategory[]
  selected: string[]
  maximum: number
  onChange: (categoryIds: string[]) => void
  label: string
}) {
  function toggle(categoryId: string) {
    if (selected.includes(categoryId)) {
      onChange(selected.filter((id) => id !== categoryId))
      return
    }
    if (selected.length < maximum) onChange([...selected, categoryId])
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{selected.length} / {maximum}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => {
          const active = selected.includes(category.id)
          const disabled = !active && selected.length >= maximum
          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => toggle(category.id)}
              className={cn(
                'flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                active ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                disabled && 'cursor-not-allowed opacity-45',
              )}
            >
              <span>{category.name}</span>
              {active && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
