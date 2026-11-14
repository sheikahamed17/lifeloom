'use client'

import { useMemo } from 'react'
import { useTasks } from '@/hooks/use-tasks'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { QUIET_TOGGLE } from '@/components/shared/quiet-toggle'

type Props = {
  userId: string
  selectedTag: string | null
  onChange: (tag: string | null) => void
}

const ALL = '__all__'

export function TaskTagFilter({ userId, selectedTag, onChange }: Props) {
  const items = useTasks(userId, 'all')
  const distinctTags = useMemo(() => {
    const tags = new Set<string>()
    for (const e of items) for (const tag of (e.tags ?? [])) tags.add(tag)
    return Array.from(tags).sort()
  }, [items])

  if (distinctTags.length === 0) return null

  return (
    <div className="flex flex-col">
      <span className="text-[13px] font-semibold text-muted-foreground">Tags</span>
      <ToggleGroup
        aria-label="Tags by tag"
        spacing={5}
        value={[selectedTag ?? ALL]}
        onValueChange={v => { const next = v[0]; onChange(!next || next === ALL ? null : next) }}
        className="max-w-full flex-wrap gap-y-0"
      >
        <ToggleGroupItem value={ALL} className={QUIET_TOGGLE}>All</ToggleGroupItem>
        {distinctTags.map(tag => (
          <ToggleGroupItem key={tag} value={tag} className={QUIET_TOGGLE}>
            {tag}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
