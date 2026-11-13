'use client'

import { useState } from 'react'
import { useCategories } from '@/hooks/use-categories'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

type Props = {
  userId: string
  kind: 'spend' | 'income'
  selectedId: string | null
  onSelect: (id: string, name: string) => void
}

/** Searchable category list (shadcn Command). Arrow keys + Enter work; a tap picks. */
export function CategoryPicker({ userId, kind, selectedId, onSelect }: Props) {
  const categories = useCategories(userId, kind)
  const [query, setQuery] = useState('')

  return (
    <Command
      label={kind === 'spend' ? 'Spend categories' : 'Income categories'}
      className="glass-soft h-auto rounded-lg"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search categories…"
        aria-label="Search categories"
        className="h-10 text-base md:text-sm"
      />
      <CommandList className="max-h-56">
        <CommandEmpty className="py-3 text-sm text-muted-foreground">No category matches “{query}”.</CommandEmpty>
        <CommandGroup>
          {categories.map(c => (
            <CommandItem
              key={c.id}
              value={c.id}
              keywords={[c.name]}
              data-checked={selectedId === c.id}
              onSelect={() => onSelect(c.id, c.name)}
              className="min-h-10 text-sm"
            >
              {c.icon && <span aria-hidden="true">{c.icon}</span>}{c.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
