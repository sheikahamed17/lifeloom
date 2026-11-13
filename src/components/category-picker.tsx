'use client'

import { useState } from 'react'
import { useCategories } from '@/hooks/use-categories'
import { cn } from '@/lib/utils'

type Props = {
  userId: string
  kind: 'spend' | 'income'
  selectedId: string | null
  onSelect: (id: string, name: string) => void
}

export function CategoryPicker({ userId, kind, selectedId, onSelect }: Props) {
  const categories = useCategories(userId, kind)
  const [query, setQuery] = useState('')

  const filtered = query
    ? categories.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
    : categories

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search categories…"
        aria-label="Search categories"
        className="glass-soft min-h-10 rounded-lg px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 md:text-sm"
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={kind === 'spend' ? 'Spend categories' : 'Income categories'}>
        {filtered.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id, c.name)}
            aria-pressed={selectedId === c.id}
            className={cn(
              'glass-soft inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-2',
              selectedId === c.id ? 'border-accent-2/60 bg-accent-2/15 text-accent-2' : 'hover:bg-white/10',
            )}
          >
            {c.icon && <span aria-hidden="true">{c.icon}</span>}{c.name}
          </button>
        ))}
        {filtered.length === 0 && <span className="text-sm text-muted-foreground">No category matches “{query}”.</span>}
      </div>
    </div>
  )
}
