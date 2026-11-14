'use client'

import { useMemo, useState } from 'react'
import { useCategories } from '@/hooks/use-categories'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

type Props = {
  userId: string
  kind: 'spend' | 'income'
  selectedId: string | null
  onSelect: (id: string, name: string) => void
}

/**
 * Searchable category list (shadcn Command), drawn as a ruled list of radio-style
 * choices with the current one first. Arrow keys + Enter work; a tap picks.
 */
export function CategoryPicker({ userId, kind, selectedId, onSelect }: Props) {
  const categories = useCategories(userId, kind)
  const [query, setQuery] = useState('')
  const ordered = useMemo(
    () => [...categories].sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId)),
    [categories, selectedId],
  )

  return (
    <Command
      label={kind === 'spend' ? 'Spend categories' : 'Income categories'}
      className="h-auto rounded-none! bg-transparent p-0"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search categories…"
        aria-label="Search categories"
        className="h-10 text-base md:text-sm"
      />
      <CommandList className="max-h-64">
        <CommandEmpty className="py-3 text-left text-sm text-muted-foreground">No category matches “{query}”.</CommandEmpty>
        <CommandGroup className="p-0">
          {ordered.map(c => {
            const selected = selectedId === c.id
            return (
              <CommandItem
                key={c.id}
                value={c.id}
                keywords={[c.name]}
                data-checked={selected}
                onSelect={() => onSelect(c.id, c.name)}
                className={cn(
                  'min-h-13 gap-3 rounded-none border-b border-border px-1 text-[15px] [&>svg]:hidden',
                  selected ? 'font-semibold' : 'font-medium',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn('grid size-5 shrink-0 place-items-center rounded-full border', selected ? 'border-foreground' : 'border-muted-foreground')}
                >
                  {selected && <span className="size-2.5 rounded-full bg-foreground" />}
                </span>
                {c.name}
                {selected && <span className="sr-only">, selected</span>}
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
