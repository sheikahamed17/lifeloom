'use client'

import { useMemo } from 'react'
import { X } from 'lucide-react'
import { useNotes } from '@/hooks/use-notes'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type Props = {
  userId: string
  selectedTag: string | null
  onChange: (tag: string | null) => void
}

export function NotesTagFilter({ userId, selectedTag, onChange }: Props) {
  const items = useNotes(userId)
  const distinctTags = useMemo(() => {
    const tags = new Set<string>()
    for (const e of items) for (const tag of (e.tags ?? [])) tags.add(tag)
    return Array.from(tags).sort()
  }, [items])

  if (distinctTags.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Filter:</span>
      <ToggleGroup
        aria-label="Filter by tag"
        value={selectedTag ? [selectedTag] : []}
        onValueChange={v => onChange(v[0] ?? null)}
        className="max-w-full flex-wrap"
      >
        {distinctTags.map(tag => (
          <ToggleGroupItem
            key={tag}
            value={tag}
            variant="outline"
            className="min-h-11 rounded-full px-3 text-xs text-muted-foreground aria-pressed:border-accent-2/50 aria-pressed:bg-accent-2/15 aria-pressed:text-accent-2"
          >
            {tag}
            {selectedTag === tag && <X className="size-3" aria-hidden />}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {selectedTag && (
        <Button variant="ghost" size="lg" onClick={() => onChange(null)} className="px-2 text-xs text-muted-foreground hover:text-foreground">
          Clear
        </Button>
      )}
    </div>
  )
}
