'use client'

import { useMemo } from 'react'
import { useTasks } from '@/hooks/use-tasks'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemGroup, ItemTitle } from '@/components/ui/item'
import { cn } from '@/lib/utils'

type Props = { userId: string }

export function TaskSummary({ userId }: Props) {
  const tasks = useTasks(userId, 'open')

  const { overdue, today, upcoming, noDate } = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
    const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1)
    let overdue = 0, today = 0, upcoming = 0, noDate = 0
    for (const t of tasks) {
      if (!t.due_at) { noDate++; continue }
      const dueMs = new Date(t.due_at).getTime()
      if (dueMs < todayStart.getTime())     overdue++
      else if (dueMs < tomorrowStart.getTime()) today++
      else                                       upcoming++
    }
    return { overdue, today, upcoming, noDate }
  }, [tasks])

  const rows: { label: string; value: number; warn?: boolean }[] = [
    { label: 'Overdue', value: overdue, warn: overdue > 0 },
    { label: 'Today', value: today },
    { label: 'Upcoming', value: upcoming },
    { label: 'No due date', value: noDate },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Tasks</CardTitle>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-0">
          {rows.map(r => (
            <Item key={r.label} role="listitem" size="xs" className="flex-nowrap justify-between py-1.5">
              <ItemTitle className={cn('font-normal', r.warn && 'text-warning')}>{r.label}</ItemTitle>
              <span className="font-mono tabular-nums">{r.value}</span>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
      <CardFooter className="bg-transparent py-3 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">{tasks.length === 0 ? 'No open tasks.' : `${tasks.length} open`}</span>
      </CardFooter>
    </Card>
  )
}
