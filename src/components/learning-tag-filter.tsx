'use client'

import { useMemo } from 'react'
import { X } from 'lucide-react'
import { useLearnings } from '@/hooks/use-learnings'
import { cn } from '@/lib/utils'

type Props = {
  userId: string
  selectedTag: string | null
  onChange: (tag: string | null) => void
}

export function LearningTagFilter({ userId, selectedTag, onChange }: Props) {
  const learnings = useLearnings(userId)

  const distinctTags = useMemo(() => {
    const tags = new Set<string>()
    for (const e of learnings) {
      for (const tag of e.tags ?? []) {
        tags.add(tag)
      }
    }
    return Array.from(tags).sort()
  }, [learnings])

  if (distinctTags.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-xs text-muted-foreground">Filter:</span>
      {distinctTags.map(tag => (
        <button
          key={tag}
          type="button"
          onClick={() => onChange(selectedTag === tag ? null : tag)}
          className={cn(
            'inline-flex items-center justify-center gap-1 px-3 min-h-11 rounded-full text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none',
            selectedTag === tag
              ? 'border border-accent-2/50 bg-accent-2/15 text-accent-2'
              : 'bg-white/10 border border-white/20 text-muted-foreground hover:text-foreground',
          )}
        >
          {tag}
          {selectedTag === tag && <X className="w-3 h-3" />}
        </button>
      ))}
      {selectedTag && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-muted-foreground hover:text-foreground transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded px-2 py-1"
        >
          Clear
        </button>
      )}
    </div>
  )
}
