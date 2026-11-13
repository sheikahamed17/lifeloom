'use client'

import { cn } from '@/lib/utils'
import type { TaskFilter as TaskFilterValue } from '@/hooks/use-tasks'

type Props = {
  active: TaskFilterValue
  onChange: (f: TaskFilterValue) => void
}

const OPTIONS: { value: TaskFilterValue; label: string }[] = [
  { value: 'open',      label: 'Open' },
  { value: 'completed', label: 'Completed' },
  { value: 'all',       label: 'All' },
]

export function TaskFilter({ active, onChange }: Props) {
  return (
    <div role="tablist" aria-label="Task filter" className="flex gap-1 rounded-full glass-soft p-1 text-xs">
      {OPTIONS.map(o => (
        <button
          key={o.value}
          role="tab"
          aria-selected={active === o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-full px-3 py-1 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none',
            active === o.value
              ? 'border border-accent-2/50 bg-accent-2/15 text-accent-2'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
