'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ChevronDown, Circle, Flame } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { useHabits, useArchivedHabits } from '@/hooks/use-habits'
import { useHabitLogs } from '@/hooks/use-habit-logs'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { habitStreaks, parseSchedule } from '@/lib/habits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PageShell } from '@/components/layout/page-shell'
import { cn } from '@/lib/utils'
import type { HabitRow } from '@/lib/dexie'

export default function HabitsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [newScheduleIsDaily, setNewScheduleIsDaily] = useState(true)
  const [newSelectedWeekdays, setNewSelectedWeekdays] = useState<Set<number>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editScheduleIsDaily, setEditScheduleIsDaily] = useState(true)
  const [editSelectedWeekdays, setEditSelectedWeekdays] = useState<Set<number>>(new Set())

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  const habits = useHabits(userId ?? undefined)
  const archived = useArchivedHabits(userId ?? undefined)
  const logs = useHabitLogs(userId ?? undefined)
  const { prefs } = useUserPrefs()

  const { todayStr } = useMemo(() => {
    const nowMs = new Date().getTime()
    const tz = prefs.tz ?? 'Asia/Kolkata'
    let today = ''
    try {
      today = new Date(nowMs).toLocaleDateString('en-CA', { timeZone: tz })
    } catch {
      today = new Date(nowMs).toLocaleDateString('en-CA', { timeZone: 'UTC' })
    }
    return { todayStr: today }
  }, [prefs.tz])

  async function addHabit() {
    if (!userId || !newName.trim()) return

    let schedule: string | null = null
    if (!newScheduleIsDaily) {
      if (newSelectedWeekdays.size > 0) {
        const sorted = Array.from(newSelectedWeekdays).sort((a, b) => a - b)
        schedule = sorted.join(',')
      }
      // If nothing selected, treat as daily (schedule stays null)
    }

    const op = await generateOp({
      entity_kind: 'habit',
      entity_id: crypto.randomUUID(),
      op_type: 'create',
      payload: {
        name: newName.trim(),
        icon: newIcon.trim() || null,
        is_archived: 0,
        schedule,
      },
      user_id: userId,
    })
    await applyLocalOp(op)
    setNewName('')
    setNewIcon('')
    setNewScheduleIsDaily(true)
    setNewSelectedWeekdays(new Set())
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function updateHabit(id: string, payload: Record<string, string | number | null>) {
    if (!userId) return
    const op = await generateOp({
      entity_kind: 'habit',
      entity_id: id,
      op_type: 'update',
      payload,
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  function startEdit(habit: HabitRow) {
    setEditingId(habit.id)
    setEditName(habit.name)
    setEditIcon(habit.icon || '')
    const parsed = parseSchedule(habit.schedule)
    setEditScheduleIsDaily(parsed === null)
    setEditSelectedWeekdays(parsed || new Set())
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return

    let schedule: string | null = null
    if (!editScheduleIsDaily) {
      if (editSelectedWeekdays.size > 0) {
        const sorted = Array.from(editSelectedWeekdays).sort((a, b) => a - b)
        schedule = sorted.join(',')
      }
    }

    await updateHabit(editingId, {
      name: editName.trim(),
      icon: editIcon.trim() || null,
      schedule,
    })
    setEditingId(null)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function archiveHabit(id: string) {
    await updateHabit(id, { is_archived: 1 })
  }

  async function restoreHabit(id: string) {
    await updateHabit(id, { is_archived: 0 })
  }

  async function toggleToday(habit: HabitRow) {
    if (!userId) return

    const habitLogs = logs.filter(l => l.habit_id === habit.id && !l.deleted_at)
    const days = habitLogs.map(l => l.day)
    const s = habitStreaks(days, todayStr, habit.schedule)

    const logId = `hlog-${habit.id}-${todayStr}`

    if (s.completedToday) {
      // Delete the log
      const op = await generateOp({
        entity_kind: 'habit_log',
        entity_id: logId,
        op_type: 'delete',
        payload: {},
        user_id: userId,
      })
      await applyLocalOp(op)
    } else {
      // Create the log
      const op = await generateOp({
        entity_kind: 'habit_log',
        entity_id: logId,
        op_type: 'create',
        payload: {
          habit_id: habit.id,
          day: todayStr,
        },
        user_id: userId,
      })
      await applyLocalOp(op)
    }

    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  if (!userId) {
    return (
      <PageShell title="Habits">
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden />Loading…</p>
      </PageShell>
    )
  }

  return (
    <PageShell title="Habits">
      {/* The daily job (marking habits done) comes first; adding a habit is the rarer one. */}
      <Card role="region" aria-labelledby="habits-active">
        <CardHeader>
          <CardTitle><h2 id="habits-active" className="text-sm font-semibold text-muted-foreground">Active habits</h2></CardTitle>
        </CardHeader>
        <CardContent>
        {habits.length === 0 && (
          <Empty className="border p-4">
            <EmptyHeader><EmptyDescription>No habits yet. Add your first one below.</EmptyDescription></EmptyHeader>
          </Empty>
        )}
        <ul className="divide-y divide-border">
          {habits.map(h => {
            const habitLogs = logs.filter(l => l.habit_id === h.id && !l.deleted_at)
            const days = habitLogs.map(l => l.day)
            const s = habitStreaks(days, todayStr, h.schedule)
            const isEditing = editingId === h.id
            const status = s.completedToday ? 'Done today' : s.dueToday ? 'Mark done' : 'Not due today'

            return (
              <li key={h.id} className="flex flex-col gap-2 py-3 first:pt-1 last:pb-0">
                {isEditing ? (
                  <>
                    <FieldGroup className="gap-2">
                      <Field orientation="horizontal">
                        <Input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder="Habit name…"
                          maxLength={40}
                          aria-label="Edit habit name"
                        />
                        <Input
                          value={editIcon}
                          onChange={e => setEditIcon(e.target.value)}
                          placeholder="Emoji"
                          maxLength={8}
                          className="w-20 text-center"
                          aria-label="Edit habit icon"
                        />
                      </Field>
                      <ScheduleControl
                        isDaily={editScheduleIsDaily}
                        selectedWeekdays={editSelectedWeekdays}
                        onDailyChange={setEditScheduleIsDaily}
                        onWeekdaysChange={setEditSelectedWeekdays}
                      />
                    </FieldGroup>
                    <div className="flex gap-2">
                      <Button onClick={saveEdit} className="flex-1">Save</Button>
                      <Button variant="ghost" onClick={cancelEdit} className="flex-1">Cancel</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1">
                      {/* The whole name is the toggle; its accessible name states the state ("Done today" / "Mark done"). */}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => toggleToday(h)}
                        className="-ml-2 h-auto min-h-11 min-w-0 flex-1 justify-start gap-3 px-2 py-1 text-left whitespace-normal"
                      >
                        {s.completedToday
                          ? <CheckCircle2 className="size-6 shrink-0 fill-accent-2/20 text-accent-2" aria-hidden />
                          : <Circle className={cn('size-6 shrink-0', s.dueToday ? 'text-foreground' : 'text-muted-foreground')} aria-hidden />}
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium">
                            {h.icon && <span aria-hidden="true" className="mr-1">{h.icon}</span>}
                            {h.name}
                          </span>
                          <span className={cn('text-xs', s.completedToday ? 'text-accent-2' : 'text-muted-foreground')}>{status}</span>
                        </span>
                      </Button>
                      <Button variant="ghost" className="px-3" onClick={() => startEdit(h)} aria-label={`Edit ${h.name}`}>
                        Edit
                      </Button>
                      <Button variant="ghost" className="px-3" onClick={() => archiveHabit(h.id)} aria-label={`Archive ${h.name}`}>
                        Archive
                      </Button>
                    </div>
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pl-9 text-xs text-muted-foreground">
                      <span>{getScheduleLabel(h.schedule)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Flame className="size-4" aria-hidden />
                        Streak {s.current}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Best {s.longest}</span>
                      <span aria-hidden="true">·</span>
                      <span>{Math.round(s.rate30 * 100)}% in the last 30 days</span>
                    </p>
                  </>
                )}
              </li>
            )
          })}
        </ul>
        </CardContent>
      </Card>

      <Card role="region" aria-labelledby="habits-new">
        <CardHeader>
          <CardTitle><h2 id="habits-new" className="text-sm font-semibold text-muted-foreground">New habit</h2></CardTitle>
        </CardHeader>
        <CardContent>
        <FieldGroup className="gap-3">
        <Field orientation="horizontal">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Habit name…"
            maxLength={40}
            aria-label="Habit name"
          />
          <Input
            value={newIcon}
            onChange={e => setNewIcon(e.target.value)}
            placeholder="Emoji"
            maxLength={8}
            className="w-20 text-center"
            aria-label="Habit icon"
          />
        </Field>
        <ScheduleControl
          isDaily={newScheduleIsDaily}
          selectedWeekdays={newSelectedWeekdays}
          onDailyChange={setNewScheduleIsDaily}
          onWeekdaysChange={setNewSelectedWeekdays}
        />
        <Button onClick={addHabit} disabled={!newName.trim()} className="w-full">Add habit</Button>
        </FieldGroup>
        </CardContent>
      </Card>

      {archived.length > 0 && (
        <ArchivedSection archived={archived} onRestore={restoreHabit} />
      )}
    </PageShell>
  )
}

function ArchivedSection({
  archived,
  onRestore,
}: {
  archived: ReturnType<typeof useArchivedHabits>
  onRestore: (id: string) => void
}) {
  return (
    <Card>
      <Collapsible>
        <CardHeader>
          <CardTitle>
            <h2>
              <CollapsibleTrigger
                render={<Button variant="ghost" className="-mx-2 flex w-[calc(100%+1rem)] justify-between px-2 text-sm font-semibold text-muted-foreground hover:text-foreground [&[data-panel-open]>svg]:rotate-180" />}
              >
                <span>Archived ({archived.length})</span>
                <ChevronDown className="size-4 transition-transform motion-reduce:transition-none" aria-hidden />
              </CollapsibleTrigger>
            </h2>
          </CardTitle>
        </CardHeader>
        <CollapsibleContent id="habits-archived">
          <CardContent>
            <ul className="divide-y divide-border">
              {archived.map(h => (
                <li key={h.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate text-sm">
                    {h.icon && <span aria-hidden="true" className="mr-1">{h.icon}</span>}
                    {h.name}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => onRestore(h.id)}
                    aria-label={`Restore ${h.name}`}
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

function getScheduleLabel(schedule: string | null): string {
  const parsed = parseSchedule(schedule)
  if (parsed === null) return 'Daily'
  const abbrev = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const sorted = Array.from(parsed).sort((a, b) => a - b)
  return sorted.map(i => abbrev[i]).join(' ')
}

interface ScheduleControlProps {
  isDaily: boolean
  selectedWeekdays: Set<number>
  onDailyChange: (daily: boolean) => void
  onWeekdaysChange: (weekdays: Set<number>) => void
}

function ScheduleControl({ isDaily, selectedWeekdays, onDailyChange, onWeekdaysChange }: ScheduleControlProps) {
  const abbrev = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <FieldGroup className="gap-2">
      <Field orientation="horizontal">
        <FieldLabel className="min-h-11 cursor-pointer items-center">
          <Checkbox
            aria-label="Daily"
            checked={isDaily}
            onCheckedChange={checked => onDailyChange(checked)}
          />
          <span>Daily</span>
        </FieldLabel>
      </Field>
      {!isDaily && (
        <ToggleGroup
          multiple
          variant="outline"
          spacing={1}
          aria-label="Days of the week"
          className="flex-wrap"
          value={Array.from(selectedWeekdays).map(String)}
          onValueChange={next => onWeekdaysChange(new Set(next.map(Number)))}
        >
          {abbrev.map((letter, i) => (
            <ToggleGroupItem
              key={i}
              value={String(i)}
              aria-label={labels[i]}
              className="size-10 aria-pressed:border-accent-2 aria-pressed:bg-accent-2/15"
            >
              {letter}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </FieldGroup>
  )
}
