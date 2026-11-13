'use client'

import { useMemo, useState } from 'react'
import { Wallet, CheckCircle2, BookOpen, NotebookPen, type LucideIcon } from 'lucide-react'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useTasks } from '@/hooks/use-tasks'
import { useLearnings } from '@/hooks/use-learnings'
import { useNotes } from '@/hooks/use-notes'
import { useCategories } from '@/hooks/use-categories'
import { searchAll } from '@/lib/search-all'
import { Command, CommandDialog, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command'
import { Kbd } from '@/components/ui/kbd'
import type { Tab } from '@/hooks/use-tab-state'

const ICON: Record<Tab, LucideIcon> = { money: Wallet, tasks: CheckCircle2, learning: BookOpen, notes: NotebookPen }

export function GlobalSearch({ userId, onClose, onSelect }: { userId: string; onClose: () => void; onSelect: (kind: Tab, id: string) => void }) {
  const [q, setQ] = useState('')
  const money = useMoneyEntries(userId)
  const tasks = useTasks(userId, 'all')
  const learnings = useLearnings(userId)
  const notes = useNotes(userId)
  const categories = useCategories(userId)
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const groups = useMemo(
    () => searchAll(q, { money, tasks, learnings, notes, categoryById }),
    [q, money, tasks, learnings, notes, categoryById],
  )

  // Mounted only while open (the page conditionally renders it), so `open` is always
  // true here; Escape / outside press / selection all route through onClose.
  return (
    <CommandDialog
      open
      onOpenChange={o => { if (!o) onClose() }}
      title="Search"
      description="Search your money, tasks, learnings and notes"
      className="sm:max-w-md"
    >
      {/* searchAll already ranks and filters, so cmdk must not filter a second time. */}
      <Command shouldFilter={false}>
        <CommandInput
          autoFocus
          value={q}
          onValueChange={setQ}
          placeholder="Search everything…"
          aria-label="Search everything"
          className="text-base md:text-sm"
        />
        <CommandList className="max-h-[60dvh]">
          {q.trim() && groups.length === 0 && (
            <p role="status" className="py-6 text-center text-sm text-muted-foreground">No matches for “{q.trim()}”.</p>
          )}
          {groups.map(g => {
            const Icon = ICON[g.kind]
            return (
              <CommandGroup key={g.kind} heading={g.heading}>
                {g.items.map(it => (
                  <CommandItem
                    key={it.id}
                    value={`${it.kind}-${it.id}`}
                    onSelect={() => onSelect(it.kind, it.id)}
                    className="min-h-11"
                  >
                    <Icon className="text-muted-foreground" aria-hidden />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.snippet && <CommandShortcut className="font-mono tabular-nums tracking-normal">{it.snippet}</CommandShortcut>}
                  </CommandItem>
                ))}
                {g.truncated && <p className="px-2 pt-1 text-xs text-muted-foreground">More matches — refine your search.</p>}
              </CommandGroup>
            )
          })}
        </CommandList>
        <p className="flex items-center justify-end gap-1.5 px-2 pb-1 pt-2 text-xs text-muted-foreground">
          <Kbd>Esc</Kbd> to close
        </p>
      </Command>
    </CommandDialog>
  )
}
