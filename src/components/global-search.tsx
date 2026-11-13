'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, X, Wallet, CheckCircle2, BookOpen, NotebookPen, type LucideIcon } from 'lucide-react'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useTasks } from '@/hooks/use-tasks'
import { useLearnings } from '@/hooks/use-learnings'
import { useNotes } from '@/hooks/use-notes'
import { useCategories } from '@/hooks/use-categories'
import { searchAll } from '@/lib/search-all'
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

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" role="dialog" aria-modal="true" aria-label="Search">
      <button type="button" aria-label="Close search" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass relative mx-auto mt-[calc(1rem_+_env(safe-area-inset-top))] flex max-h-[85dvh] w-full max-w-md flex-col gap-3 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search everything…"
            aria-label="Search everything"
            className="min-h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto">
          {q.trim() && groups.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No matches for “{q.trim()}”.</p>
          )}
          {groups.map(g => {
            const Icon = ICON[g.kind]
            return (
              <section key={g.kind} className="flex flex-col gap-1">
                <h3 className="px-1 text-sm font-semibold">{g.heading}</h3>
                <ul className="flex flex-col gap-1">
                  {g.items.map(it => (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(it.kind, it.id)}
                        className="glass-soft flex w-full items-center gap-2 rounded-lg px-3 py-2 min-h-11 text-left text-sm hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                      >
                        <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{it.label}</span>
                        {it.snippet && <span className="flex-shrink-0 font-mono tabular-nums text-xs text-muted-foreground">{it.snippet}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
                {g.truncated && <p className="px-1 text-xs text-muted-foreground">More matches — refine your search.</p>}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
