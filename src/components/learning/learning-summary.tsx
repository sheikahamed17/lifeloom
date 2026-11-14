'use client'

import { useMemo } from 'react'
import { useLearnings } from '@/hooks/use-learnings'
import { PanelStat, SummaryPanel } from '@/components/shared/summary-panel'

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
    <SummaryPanel
      eyebrow="This week"
      value={thisWeek}
      unit={thisWeek === 1 ? 'thing learned' : 'things learned'}
      stats={
        <>
          <PanelStat label="Total" value={learnings.length} />
          {topTags.length > 0 && <PanelStat label="Top tags" value={topTags.join(', ')} />}
        </>
      }
    />
  )
}
