'use client'

import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
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
      variant="ghost"
      onClick={onGoToTasks}
      aria-label={`${copy}. Go to Tasks`}
      className="h-auto min-h-13 w-full justify-start gap-3 whitespace-normal rounded-2xl bg-card px-4 py-2.5 font-normal hover:bg-card"
    >
      <span className="flex-1 text-left text-[15px] font-semibold">{copy}</span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-muted-foreground">Tasks<ChevronRight className="size-4" aria-hidden /></span>
    </Button>
  )
}
