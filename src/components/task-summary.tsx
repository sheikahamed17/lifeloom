'use client'

import { useMemo } from 'react'
import { useTasks } from '@/hooks/use-tasks'

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

  return (
    <section className="glass flex flex-col gap-2 rounded-2xl p-4">
      <header>
        <span className="text-sm font-semibold">Tasks</span>
      </header>
      <ul className="flex flex-col gap-1.5 text-sm">
        <li className="flex items-center justify-between">
          <span className={overdue > 0 ? 'text-warning' : ''}>Overdue</span>
          <span className="font-mono tabular-nums">{overdue}</span>
        </li>
        <li className="flex items-center justify-between">
          <span>Today</span>
          <span className="font-mono tabular-nums">{today}</span>
        </li>
        <li className="flex items-center justify-between">
          <span>Upcoming</span>
          <span className="font-mono tabular-nums">{upcoming}</span>
        </li>
        <li className="flex items-center justify-between">
          <span>No due date</span>
          <span className="font-mono tabular-nums">{noDate}</span>
        </li>
      </ul>
      <div className="border-t border-white/10 pt-2 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">{tasks.length === 0 ? 'No open tasks.' : `${tasks.length} open`}</span>
      </div>
    </section>
  )
}
