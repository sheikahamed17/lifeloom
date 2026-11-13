'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
    <Tabs value={active} onValueChange={v => onChange(v as TaskFilterValue)}>
      <TabsList aria-label="Task filter" className="glass-soft group-data-horizontal/tabs:h-auto w-full gap-1 rounded-lg bg-transparent p-1">
        {OPTIONS.map(o => (
          <TabsTrigger
            key={o.value}
            value={o.value}
            className="h-auto min-h-10 rounded-lg px-3 text-xs text-muted-foreground focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-accent-2 data-active:border-accent-2/50 data-active:bg-accent-2/15 data-active:text-accent-2 data-active:shadow-none"
          >
            {o.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
