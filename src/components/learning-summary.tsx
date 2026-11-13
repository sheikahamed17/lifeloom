'use client'

import { useMemo } from 'react'
import { useLearnings } from '@/hooks/use-learnings'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Separator } from '@/components/ui/separator'

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

  const rows = [
    { label: 'This week', value: thisWeek },
    { label: 'Total', value: learnings.length },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Learnings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ItemGroup className="gap-0">
          {rows.map(r => (
            <Item key={r.label} role="listitem" size="xs" className="flex-nowrap justify-between py-1.5">
              <ItemTitle className="font-normal">{r.label}</ItemTitle>
              <span className="font-mono tabular-nums">{r.value}</span>
            </Item>
          ))}
        </ItemGroup>
        {topTags.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground">Top tags</span>
              <div className="flex flex-wrap gap-1">
                {topTags.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-muted-foreground">{tag}</Badge>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
