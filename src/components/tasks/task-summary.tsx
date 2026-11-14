'use client'

import { useMemo } from 'react'
import { useTasks } from '@/hooks/use-tasks'
import { PanelStat, SummaryPanel } from '@/components/shared/summary-panel'

type Props = { userId: string }

export function TaskSummary({ userId }: Props) {
  const tasks = useTasks(userId, 'open')

  const { overdue, today, upcoming, noDate, dateLabel } = useMemo(() => {
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
    const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })
    return { overdue, today, upcoming, noDate, dateLabel }
  }, [tasks])

  return (
    <SummaryPanel
      eyebrow={dateLabel}
      value={tasks.length}
      unit={tasks.length === 1 ? 'open task' : 'open tasks'}
      stats={
        <>
          <PanelStat label="Overdue" value={overdue} highlight={overdue > 0} />
          <PanelStat label="Due today" value={today} />
          <PanelStat label="Upcoming" value={upcoming} />
          <PanelStat label="No due date" value={noDate} />
        </>
      }
    />
  )
}
