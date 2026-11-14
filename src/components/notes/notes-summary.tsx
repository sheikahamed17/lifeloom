'use client'

import { useMemo } from 'react'
import { useNotes } from '@/hooks/use-notes'

type Props = { userId: string }

export function NotesSummary({ userId }: Props) {
  const notes = useNotes(userId)

  const { thisWeek, topTags } = useMemo(() => {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    let thisWeek = 0
    const tagCounts = new Map<string, number>()

    for (const e of notes) {
      const entryDate = new Date(e.occurred_at)
      if (entryDate >= weekAgo) thisWeek++

      for (const tag of e.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      }
    }

    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag)

    return { thisWeek, topTags }
  }, [notes])

  const rows = [
    { label: 'This week', value: thisWeek },
    { label: 'Total', value: notes.length },
  ]

  // Notes have no headline figure, so this is a plain ruled section, not the green panel.
  return (
    <section aria-labelledby="notes-summary-heading" className="flex flex-col">
      <div className="border-b border-border pb-2.5">
        <h2 id="notes-summary-heading" className="text-[19px] font-bold tracking-[-0.02em] lg:text-[22px]">Notes</h2>
      </div>
      <dl className="flex flex-col">
        {rows.map(r => (
          <div key={r.label} className="flex min-h-[52px] items-center justify-between gap-4 border-b border-border">
            <dt className="text-[15px] font-medium">{r.label}</dt>
            <dd className="text-base font-semibold tabular-nums">{r.value}</dd>
          </div>
        ))}
        {topTags.length > 0 && (
          <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border py-2">
            <dt className="text-[15px] font-medium">Top tags</dt>
            <dd className="text-[13px] text-muted-foreground">{topTags.join(', ')}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}
