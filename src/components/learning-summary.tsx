'use client'

import { useMemo } from 'react'
import { useLearnings } from '@/hooks/use-learnings'

type Props = { userId: string }

export function LearningSummary({ userId }: Props) {
  const learnings = useLearnings(userId)

  const { thisWeek, topTags } = useMemo(() => {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    let thisWeek = 0
    const tagCounts = new Map<string, number>()

    for (const e of learnings) {
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
  }, [learnings])

  return (
    <section className="glass flex flex-col gap-2 rounded-2xl p-4">
      <header>
        <span className="text-sm font-semibold">Learnings</span>
      </header>
      <ul className="flex flex-col gap-1.5 text-sm">
        <li className="flex items-center justify-between">
          <span>This week</span>
          <span className="font-mono tabular-nums">{thisWeek}</span>
        </li>
        <li className="flex items-center justify-between">
          <span>Total</span>
          <span className="font-mono tabular-nums">{learnings.length}</span>
        </li>
      </ul>
      {topTags.length > 0 && (
        <>
          <div className="border-t border-white/10 pt-2" />
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-muted-foreground">Top tags</span>
            <div className="flex flex-wrap gap-1">
              {topTags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-muted-foreground border border-white/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
