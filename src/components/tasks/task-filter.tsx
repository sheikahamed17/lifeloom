'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
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

/**
 * Open / Completed / All narrows ONE list, it doesn't switch between sections, so it is a
 * segmented control (single-select toggle group), not tabs: tabs would need a panel each.
 */
export function TaskFilter({ active, onChange }: Props) {
  return (
    <ToggleGroup
      aria-label="Task filter"
      className="w-full"
      value={[active]}
      onValueChange={next => { if (next[0]) onChange(next[0] as TaskFilterValue) }}
    >
      {OPTIONS.map(o => (
        <ToggleGroupItem key={o.value} value={o.value} className="h-10 flex-1 px-3 text-sm">
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
