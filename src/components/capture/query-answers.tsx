'use client'

import { useEffect } from 'react'
import { Circle, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { QueryListAnswer } from '@/components/capture/query-list-answer'
import type { QueryPlan } from '@/lib/query-plans'
import { filterTasksForQuery } from '@/lib/query-task-exec'
import { filterLearningsForQuery } from '@/lib/query-learning-exec'
import { filterNotesForQuery } from '@/lib/query-notes-exec'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useLearnings } from '@/hooks/use-learnings'
import { useNotes } from '@/hooks/use-notes'
import { useTasks } from '@/hooks/use-tasks'
import { formatLocalDateTime } from '@/lib/format'
import type { SpokenAnswerInput } from '@/lib/speak-answer'

export function QueryTaskListAnswer({ userId, plan, onDismiss, onResult }: { userId: string; plan: Extract<QueryPlan, { kind: 'query_task' }>; onDismiss: () => void; onResult?: (i: SpokenAnswerInput) => void }) {
  const allTasks = useTasks(userId, 'all')
  const nowIso = new Date().toISOString()
  const filtered = filterTasksForQuery(allTasks, plan, nowIso)
  const { prefs } = useUserPrefs()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onResult?.({ kind: 'task', count: filtered.length, status: plan.status }) }, [plan, filtered.length])

  const title = plan.status === 'open' ? 'Open tasks' :
    plan.status === 'overdue' ? 'Overdue tasks' :
    plan.status === 'done' ? 'Completed tasks' :
    'All tasks'

  return (
    <QueryListAnswer
      title={title}
      count={filtered.length}
      onDismiss={onDismiss}
    >
      <ul className="flex flex-col divide-y divide-border">
        {filtered.map(t => {
          const isCompleted = !!t.completed_at
          const isOverdue = !isCompleted && t.due_at && t.due_at < nowIso
          return (
            <li
              key={t.id}
              className="flex min-h-[52px] items-start justify-between gap-3 py-3"
            >
              <div className="flex flex-1 items-start gap-2 text-left">
                {isCompleted ? (
                  <CheckCircle2 className="mt-0.5 size-[18px] shrink-0 text-foreground" aria-label="Task completed" />
                ) : (
                  <Circle className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" aria-label={isOverdue ? "Task overdue" : "Task pending"} />
                )}
                <div className="flex flex-col gap-0.5 text-[15px] font-medium">
                  <span className={isCompleted ? 'text-muted-foreground line-through' : ''}>
                    {t.title}
                  </span>
                  <span className="text-[13px] font-normal text-muted-foreground">
                    {t.priority !== 'medium' && (
                      <span className={`mr-2 ${t.priority === 'high' ? 'font-medium text-warning' : ''}`}>
                        {t.priority}
                      </span>
                    )}
                    {t.due_at && (
                      <span className={`tabular-nums ${isOverdue ? 'text-warning' : ''}`}>
                        due {formatLocalDateTime(t.due_at, prefs.tz)}
                        {isOverdue && ' · overdue'}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </QueryListAnswer>
  )
}

export function QueryLearningListAnswer({ userId, plan, onDismiss, onResult }: { userId: string; plan: Extract<QueryPlan, { kind: 'query_learning' }>; onDismiss: () => void; onResult?: (i: SpokenAnswerInput) => void }) {
  const allLearnings = useLearnings(userId)
  const filtered = filterLearningsForQuery(allLearnings, plan)
  const { prefs } = useUserPrefs()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onResult?.({ kind: 'learning', count: filtered.length, search: plan.search }) }, [plan, filtered.length])

  let title = 'Learnings'
  if (plan.search) title = `Learnings about ${plan.search}`
  if (plan.tags.length > 0) title = `Learnings tagged ${plan.tags.join(', ')}`
  if (plan.search && plan.tags.length > 0) title = `Learnings about ${plan.search} tagged ${plan.tags.join(', ')}`
  if (plan.period) title += ` ${plan.period.label}`

  return (
    <QueryListAnswer
      title={title}
      count={filtered.length}
      onDismiss={onDismiss}
    >
      <ul className="flex flex-col divide-y divide-border">
        {filtered.map(l => (
          <li
            key={l.id}
            className="flex flex-col gap-2 py-3"
          >
            <p className="text-[15px]">{l.text}</p>
            {l.tags.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {l.tags.map(tag => (
                  <Badge key={tag} variant="outline" className="h-auto border-0 bg-transparent p-0 text-[13px] font-medium text-muted-foreground">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
              <div className="flex items-center gap-2">
                {l.attribution && (
                  <span className="truncate">{l.attribution}</span>
                )}
              </div>
              <span className="tabular-nums flex-shrink-0">
                {formatLocalDateTime(l.occurred_at, prefs.tz)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </QueryListAnswer>
  )
}

export function QueryNotesListAnswer({ userId, plan, onDismiss, onResult }: { userId: string; plan: Extract<QueryPlan, { kind: 'query_notes' }>; onDismiss: () => void; onResult?: (i: SpokenAnswerInput) => void }) {
  const allNotes = useNotes(userId)
  const filtered = filterNotesForQuery(allNotes, plan)
  const { prefs } = useUserPrefs()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onResult?.({ kind: 'notes', count: filtered.length, search: plan.search }) }, [plan, filtered.length])

  let title = 'Notes'
  if (plan.search) title = `Notes about ${plan.search}`
  if (plan.tags.length > 0) title = `Notes tagged ${plan.tags.join(', ')}`
  if (plan.search && plan.tags.length > 0) title = `Notes about ${plan.search} tagged ${plan.tags.join(', ')}`
  if (plan.period) title += ` ${plan.period.label}`

  return (
    <QueryListAnswer
      title={title}
      count={filtered.length}
      onDismiss={onDismiss}
    >
      <ul className="flex flex-col divide-y divide-border">
        {filtered.map(n => (
          <li
            key={n.id}
            className="flex flex-col gap-2 py-3"
          >
            <p className="text-[15px] font-medium">{n.title || n.body}</p>
            {n.title && <p className="line-clamp-2 text-[13px] text-muted-foreground">{n.body}</p>}
            {n.tags.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {n.tags.map(tag => (
                  <Badge key={tag} variant="outline" className="h-auto border-0 bg-transparent p-0 text-[13px] font-medium text-muted-foreground">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end text-[13px] text-muted-foreground">
              <span className="tabular-nums flex-shrink-0">
                {formatLocalDateTime(n.occurred_at, prefs.tz)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </QueryListAnswer>
  )
}
