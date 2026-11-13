'use client'

import { useMemo } from 'react'
import { ChevronRight, Clock } from 'lucide-react'
import { useTasks } from '@/hooks/use-tasks'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { taskAttention, attentionCopy } from '@/lib/task-attention'
import { Button } from '@/components/ui/button'

export function TodayNudge({ userId, onGoToTasks }: { userId: string; onGoToTasks: () => void }) {
  const tasks = useTasks(userId, 'open')
  const { prefs } = useUserPrefs()
  const copy = useMemo(
    () => attentionCopy(taskAttention(tasks, new Date().toISOString(), prefs.tz)),
    [tasks, prefs.tz],
  )
  if (!copy) return null
  return (
    <Button
      variant="outline"
      onClick={onGoToTasks}
      aria-label={`${copy}. Go to Tasks`}
      className="glass-soft h-12 w-full justify-start gap-2 rounded-2xl px-4 font-normal"
    >
      <Clock className="size-4 shrink-0 text-warning" aria-hidden />
      <span className="flex-1 text-left font-medium">{copy}</span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground">Tasks<ChevronRight className="size-4" aria-hidden /></span>
    </Button>
  )
}
