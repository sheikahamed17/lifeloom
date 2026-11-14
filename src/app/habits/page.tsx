'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { useHabits, useArchivedHabits } from '@/hooks/use-habits'
import { useHabitLogs } from '@/hooks/use-habit-logs'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { habitStreaks, parseSchedule } from '@/lib/habits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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

  const rows = habits.map(h => {
    const days = logs.filter(l => l.habit_id === h.id && !l.deleted_at).map(l => l.day)
    return { h, s: habitStreaks(days, todayStr, h.schedule) }
  })
  const dueCount = rows.filter(r => r.s.dueToday || r.s.completedToday).length
  const leftCount = rows.filter(r => r.s.dueToday && !r.s.completedToday).length

  return (
    <PageShell title="Habits" width="wide" description={`${dayLabel(todayStr)}. Tick a habit when it is done.`}>
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] lg:items-start lg:gap-x-14">
      {/* The daily job (marking habits done) comes first; adding a habit is the rarer one. */}
      <section role="region" aria-labelledby="habits-active" className="flex min-w-0 flex-col">
        <div className="flex items-end justify-between gap-4 border-b border-border pb-2.5">
          <h2 id="habits-active" className={HEADING}>Active habits</h2>
          {leftCount > 0 ? (
            <span className="text-[13px] font-semibold text-warning lg:text-sm">{leftCount} left today</span>
          ) : dueCount > 0 ? (
            <span className="text-[13px] text-muted-foreground lg:text-sm">All done today</span>
          ) : null}
        </div>
        {habits.length === 0 && (
          <p className="pt-3.5 text-[15px] text-muted-foreground">No habits yet. Add your first one below.</p>
        )}
        <ul className="flex flex-col">
          {rows.map(({ h, s }) => {
            const isEditing = editingId === h.id
            const status = s.completedToday ? 'Done today' : s.dueToday ? 'Due today' : 'Not due today'

            return (
              <li key={h.id} className="border-b border-border">
                {isEditing ? (
                  <div className="flex flex-col gap-4 py-4">
                    <FieldGroup className="gap-0">
                      <div className="flex gap-2">
                        <Field className="min-w-0 flex-1">
                          <FieldLabel htmlFor="habit-edit-name" className={LABEL}>Habit name</FieldLabel>
                          <Input
                            id="habit-edit-name"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            maxLength={40}
                            aria-label="Edit habit name"
                          />
                        </Field>
                        <Field className="w-24 shrink-0">
                          <FieldLabel htmlFor="habit-edit-icon" className={LABEL}>Icon</FieldLabel>
                          <Input
                            id="habit-edit-icon"
                            value={editIcon}
                            onChange={e => setEditIcon(e.target.value)}
                            placeholder="Optional"
                            maxLength={8}
                            className="text-center"
                            aria-label="Edit habit icon"
                          />
                        </Field>
                      </div>
                      <ScheduleControl
                        isDaily={editScheduleIsDaily}
                        selectedWeekdays={editSelectedWeekdays}
                        onDailyChange={setEditScheduleIsDaily}
                        onWeekdaysChange={setEditSelectedWeekdays}
                      />
                    </FieldGroup>
                    <div className="flex gap-2">
                      <Button onClick={saveEdit} className="flex-1">Save</Button>
                      <Button variant="outline" onClick={cancelEdit} className="flex-1">Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center pb-3 pt-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:gap-x-4 lg:py-1">
                    {/* The whole name is the toggle; its accessible name states the state ("Done today" / "Due today"). */}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => toggleToday(h)}
                      className="col-start-1 row-start-1 -ml-2 h-auto min-h-13 min-w-0 justify-start gap-3 rounded-xl px-2 py-1 text-left whitespace-normal"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mr-1 flex size-[22px] shrink-0 items-center justify-center rounded-md border-2',
                          s.completedToday ? 'border-foreground bg-foreground text-background' : s.dueToday ? 'border-foreground' : 'border-muted-foreground',
                        )}
                      >
                        {s.completedToday && <Check className="size-4" strokeWidth={3} />}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[15px] font-semibold">{h.name}</span>
                        <span className={cn('text-[13px]', !s.completedToday && s.dueToday ? 'font-medium text-warning' : 'font-normal text-muted-foreground')}>{status}</span>
                      </span>
                    </Button>
                    <span className="col-start-2 row-start-1 flex shrink-0 gap-1 lg:col-start-3">
                      <Button variant="link" className="h-11 px-2 text-sm" onClick={() => startEdit(h)} aria-label={`Edit ${h.name}`}>
                        Edit
                      </Button>
                      <Button variant="link" className="h-11 pl-2 pr-0 text-sm" onClick={() => archiveHabit(h.id)} aria-label={`Archive ${h.name}`}>
                        Archive
                      </Button>
                    </span>
                    <p className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-[38px] text-[13px] text-muted-foreground lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:pl-0 lg:text-sm">
                      <span>{getScheduleLabel(h.schedule)}</span>
                      <span aria-hidden="true">·</span>
                      <span>Streak {s.current}</span>
                      <span aria-hidden="true">·</span>
                      <span>Best {s.longest}</span>
                      <span aria-hidden="true">·</span>
                      <span>{Math.round(s.rate30 * 100)}% in the last 30 days</span>
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <div className="flex min-w-0 flex-col gap-8 lg:gap-10">
      <section role="region" aria-labelledby="habits-new" className="flex flex-col">
        <div className="border-b border-border pb-2.5">
          <h2 id="habits-new" className={HEADING}>New habit</h2>
        </div>
        <FieldGroup className="gap-0 pt-4">
          <div className="flex gap-2">
            <Field className="min-w-0 flex-1">
              <FieldLabel htmlFor="habit-name" className={LABEL}>Habit name</FieldLabel>
              <Input
                id="habit-name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                maxLength={40}
                aria-label="Habit name"
              />
            </Field>
            <Field className="w-24 shrink-0">
              <FieldLabel htmlFor="habit-icon" className={LABEL}>Icon</FieldLabel>
              <Input
                id="habit-icon"
                value={newIcon}
                onChange={e => setNewIcon(e.target.value)}
                placeholder="Optional"
                maxLength={8}
                className="text-center"
                aria-label="Habit icon"
              />
            </Field>
          </div>
          <ScheduleControl
            isDaily={newScheduleIsDaily}
            selectedWeekdays={newSelectedWeekdays}
            onDailyChange={setNewScheduleIsDaily}
            onWeekdaysChange={setNewSelectedWeekdays}
          />
          <Button size="lg" onClick={addHabit} disabled={!newName.trim()} className="mt-4 w-full">Add habit</Button>
        </FieldGroup>
      </section>

      {archived.length > 0 && (
        <ArchivedSection archived={archived} onRestore={restoreHabit} />
      )}
      </div>
      </div>
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
    <section className="flex flex-col">
      <Collapsible>
        <h2 className="border-b border-border">
          <CollapsibleTrigger
            render={<Button variant="ghost" className={cn('flex h-11 w-full justify-between rounded-none px-0 pb-2.5 hover:bg-transparent [&[data-panel-open]>svg]:rotate-180', HEADING)} />}
          >
            <span>Archived ({archived.length})</span>
            <ChevronDown className="size-5 transition-transform motion-reduce:transition-none" aria-hidden />
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent id="habits-archived">
          <ul className="flex flex-col">
            {archived.map(h => (
              <li key={h.id} className="flex min-h-13 items-center justify-between gap-3 border-b border-border">
                <span className="min-w-0 truncate text-[15px] font-medium text-muted-foreground">{h.name}</span>
                <Button
                  variant="link"
                  className="h-11 pl-2 pr-0 text-sm"
                  onClick={() => onRestore(h.id)}
                  aria-label={`Restore ${h.name}`}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}

const HEADING = 'text-[19px] font-bold leading-snug tracking-[-0.02em] lg:text-[22px]'
const LABEL = 'text-[13px] font-semibold text-muted-foreground'

/** "Saturday, 14 Nov" for a YYYY-MM-DD day. */
function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return 'Today'
  const part = (opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts })
  return `${part({ weekday: 'long' })}, ${part({ day: 'numeric' })} ${part({ month: 'short' })}`
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
    <FieldGroup className="gap-0">
      <FieldLabel className="flex h-15 w-full cursor-pointer items-center justify-between gap-3 border-b border-border text-[15px] font-medium text-foreground has-data-checked:border-border has-data-checked:bg-transparent">
        <span>Daily</span>
        <Checkbox
          aria-label="Daily"
          className="size-[22px] rounded-md border-2 border-foreground"
          checked={isDaily}
          onCheckedChange={checked => onDailyChange(checked)}
        />
      </FieldLabel>
      {!isDaily && (
        <div className="flex flex-col gap-2 pt-3.5">
          <span className={LABEL}>Days of the week</span>
          <ToggleGroup
            multiple
            spacing={1.5}
            aria-label="Days of the week"
            className="grid w-full grid-cols-7"
            value={Array.from(selectedWeekdays).map(String)}
            onValueChange={next => onWeekdaysChange(new Set(next.map(Number)))}
          >
            {abbrev.map((letter, i) => (
              <ToggleGroupItem
                key={i}
                value={String(i)}
                aria-label={labels[i]}
                className="h-11 min-w-0 rounded-xl bg-card px-0 text-sm font-medium text-foreground hover:bg-card aria-pressed:bg-foreground aria-pressed:font-bold aria-pressed:text-background aria-pressed:hover:bg-foreground aria-pressed:hover:text-background"
              >
                {letter}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
    </FieldGroup>
  )
}
