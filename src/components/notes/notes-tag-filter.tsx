'use client'

import { useMemo } from 'react'
import { useNotes } from '@/hooks/use-notes'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { QUIET_TOGGLE } from '@/components/shared/quiet-toggle'

type Props = {
  userId: string
  selectedTag: string | null
  onChange: (tag: string | null) => void
}

const ALL = '__all__'

export function NotesTagFilter({ userId, selectedTag, onChange }: Props) {
  const items = useNotes(userId)
  const distinctTags = useMemo(() => {
    const tags = new Set<string>()
    for (const e of items) for (const tag of (e.tags ?? [])) tags.add(tag)
    return Array.from(tags).sort()
  }, [items])

  if (distinctTags.length === 0) return null

  // "All" is the cleared state; pressing the active tag again also clears it.
  return (
    <ToggleGroup
      aria-label="Filter by tag"
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
  )
}
