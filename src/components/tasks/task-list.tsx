'use client'

import { useState, useMemo } from 'react'
import { Trash2, Repeat, Plus, Pencil, Bell, BellOff } from 'lucide-react'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { taskCompletionOps, formatRecurrence } from '@/lib/recurring-task'
import { groupTasks, subtaskProgress, rollupOps, visibleNodes, type TaskNode } from '@/lib/subtasks'
import { SwipeRow } from '@/components/shared/swipe-row'
import { RowMenu } from '@/components/shared/row-menu'
import { useUndo } from '@/components/providers/undo-provider'
import { resurrectPayload } from '@/lib/undo-delete'
import { useTasks, type TaskFilter } from '@/hooks/use-tasks'
import { useProjects } from '@/hooks/use-projects'
import { formatLocalDateTime } from '@/lib/format'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { EntryTimestamp } from '@/components/money/entry-timestamp'
import { sortTasks, type TaskSort } from '@/lib/list-sort'
import { db, type TaskRow } from '@/lib/dexie'
import { Checkbox } from '@/components/ui/checkbox'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Props = { userId: string; filter: TaskFilter; projectId?: string | null; tag?: string | null; sort?: TaskSort; onEdit?: (row: TaskRow) => void }

export function TaskList({ userId, filter, projectId = null, tag = null, sort = 'due', onEdit }: Props) {
  // Group from the FULL set so progress counts include completed children even in
  // the "open" view; visibleNodes then filters at the PARENT level.
  const tasks = useTasks(userId, 'all')
  const projects = useProjects(userId, true)
  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects])
  const unsortedNodes = useMemo(() => visibleNodes(groupTasks(tasks), filter, projectId, tag), [tasks, filter, projectId, tag])
  const nodes = useMemo(() => {
    // Sort only the top-level nodes; keep children in stable order
    // TaskNode extends TaskRow, so we can pass it to sortTasks
    const sortedTopLevel = sortTasks(unsortedNodes as TaskRow[], sort) as TaskNode[]
    return sortedTopLevel
  }, [unsortedNodes, sort])
  const groups = useMemo(() => groupByDue(nodes, new Date()), [nodes])
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const { prefs } = useUserPrefs()
  const undo = useUndo()

  async function toggleComplete(t: TaskRow) {
    const nowIso = new Date().toISOString()
    // Completing a recurring task clears its recurrence + spawns the next instance;
    // every other toggle is a plain completed_at flip.
    const { update, next } = taskCompletionOps(t, nowIso)
    await applyLocalOp(await generateOp({
      entity_kind: 'task', entity_id: t.id, op_type: 'update', payload: update, user_id: userId,
    }))
    if (next) {
      await applyLocalOp(await generateOp({
        entity_kind: 'task', entity_id: crypto.randomUUID(), op_type: 'create', payload: next, user_id: userId,
      }))
    }
    // Sub-task: roll the completion up to the parent (bottom-up auto-complete).
    // Read siblings FRESH from Dexie (after the child op applied) so a concurrent
    // sync can't leave us rolling up a stale sibling set.
    if (t.parent_id) {
      const all = await db.tasks.where('user_id').equals(userId).toArray()
      const parent = all.find(x => x.id === t.parent_id)
      if (parent && !parent.deleted_at) {
        const siblings = all.filter(x => x.parent_id === t.parent_id && !x.deleted_at)
        const roll = rollupOps(parent, siblings, nowIso)
        if (roll) await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: parent.id, op_type: 'update', payload: roll, user_id: userId }))
      }
    }
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function deleteTask(t: TaskRow) {
    // Cascade-delete a parent's sub-tasks (meaningless without the parent).
    const children = tasks.filter(x => x.parent_id === t.id && !x.deleted_at)
    const deletedRows = [...children, t]   // exact rows this action tombstones
    for (const c of children) {
      await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: c.id, op_type: 'delete', payload: {}, user_id: userId }))
    }
    await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: t.id, op_type: 'delete', payload: {}, user_id: userId }))
    // Deleting a sub-task may leave the remaining siblings all-complete → roll up.
    if (t.parent_id) {
      const all = await db.tasks.where('user_id').equals(userId).toArray()
      const parent = all.find(x => x.id === t.parent_id)
      const remaining = all.filter(x => x.parent_id === t.parent_id && !x.deleted_at) // deleted child already tombstoned
      const roll = parent && !parent.deleted_at ? rollupOps(parent, remaining, new Date().toISOString()) : null
      if (parent && roll) await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: parent.id, op_type: 'update', payload: roll, user_id: userId }))
    }
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    setMenuFor(null)
    undo.push(`Deleted "${t.title}"`, async () => {
      // Resurrect the whole tombstoned set (parent + sub-tasks, or a single sub-task).
      for (const r of deletedRows) {
        await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: r.id, op_type: 'update', payload: resurrectPayload('task', r), user_id: userId }))
      }
      // Re-derive the parent's completion after resurrecting a sub-task.
      if (t.parent_id) {
        const all = await db.tasks.where('user_id').equals(userId).toArray()
        const parent = all.find(x => x.id === t.parent_id)
        const siblings = all.filter(x => x.parent_id === t.parent_id && !x.deleted_at)
        const roll = parent && !parent.deleted_at ? rollupOps(parent, siblings, new Date().toISOString()) : null
        if (parent && roll) await applyLocalOp(await generateOp({ entity_kind: 'task', entity_id: parent.id, op_type: 'update', payload: roll, user_id: userId }))
      }
      pushPullOnce({ userId }).catch(err => console.error('sync', err))
    })
  }

  async function toggleMute(t: TaskRow) {
    await applyLocalOp(await generateOp({
      entity_kind: 'task', entity_id: t.id, op_type: 'update',
      payload: { nudge_muted_at: t.nudge_muted_at ? null : new Date().toISOString() },
      user_id: userId,
    }))
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function addSubtask(parentId: string, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return
    await applyLocalOp(await generateOp({
      entity_kind: 'task', entity_id: crypto.randomUUID(), op_type: 'create',
      payload: { title: trimmed, priority: 'medium', completed_at: null, source: 'manual', parent_id: parentId, tags: [], project_id: null },
      user_id: userId,
    }))
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  function renderRow(t: TaskRow, node?: TaskNode) {
    const progress = node ? subtaskProgress(node) : null
    const hasChildren = !!progress
    const isCompleted = hasChildren ? progress!.done === progress!.total : !!t.completed_at
    const isOverdue = !isCompleted && t.due_at && t.due_at < new Date().toISOString()
    const project = t.project_id ? projectById.get(t.project_id) : undefined
    return (
      // The swipe layer clips its content, so it is pulled 12px wider than the column:
      // the row menu can then sit in the margin and the text still lines up with the rule.
      <div id={`pulse-row-${t.id}`} className="relative -mx-3">
        <SwipeRow
          isOpen={openId === t.id}
          onOpenChange={o => setOpenId(o ? t.id : null)}
          onTap={onEdit ? () => onEdit(t) : undefined}
          onLongPress={() => setMenuFor(t.id)}
          onDelete={() => deleteTask(t)}
          deleteLabel={`Delete task: ${t.title.slice(0, 30)}${t.title.length > 30 ? '…' : ''}`}
          className={cn('flex items-center gap-3 py-2 pl-3 pr-1 lg:gap-3.5', node ? 'min-h-[60px]' : 'min-h-[52px]')}
        >
          {/* The checkbox completes the task; a tap anywhere else on the row opens the editor. */}
          {/* A parent's checkbox is read-only: it reflects its sub-tasks. */}
          <Checkbox
            checked={isCompleted}
            readOnly={hasChildren}
            onCheckedChange={() => { if (!hasChildren) toggleComplete(t) }}
            aria-label={hasChildren ? `${t.title}: ${progress!.done} of ${progress!.total} sub-tasks done` : (isCompleted ? `Mark "${t.title}" open` : `Complete "${t.title}"`)}
            className="mr-1 size-[22px] rounded-md border-muted-foreground bg-card after:-inset-[11px]"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 lg:flex-row lg:items-center lg:gap-3.5">
            <span className={cn('min-w-0 text-[15px] lg:flex-[2] lg:text-base', isCompleted ? 'text-muted-foreground line-through' : 'font-semibold')}>
              {t.title}
              {progress && <span className="ml-2 text-[13px] font-normal tabular-nums text-muted-foreground">{progress.done}/{progress.total}</span>}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground lg:contents lg:text-sm">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 empty:hidden lg:flex-1 lg:empty:block">
                {t.recur_period && t.recur_interval && (
                  <span className="inline-flex items-center gap-1">
                    <Repeat className="size-3.5" aria-hidden /> {formatRecurrence(t.recur_period, t.recur_interval)}
                  </span>
                )}
                {project && (
                  <span className="inline-flex items-center gap-1.5">
                    {project.color && (
                      <span className="size-2 rounded-full" style={{ backgroundColor: project.color }} aria-hidden />
                    )}
                    {project.name}
                  </span>
                )}
                {(t.tags ?? []).map(tg => (
                  <span key={tg}>#{tg}</span>
                ))}
                {t.priority !== 'medium' && (
                  <span className={t.priority === 'high' ? 'font-semibold text-foreground' : undefined}>
                    {t.priority}
                  </span>
                )}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 lg:w-56 lg:shrink-0 lg:justify-end lg:text-right">
                {t.due_at && (
                  <span className={cn('tabular-nums', isOverdue && 'font-medium text-warning')}>
                    due {formatLocalDateTime(t.due_at, prefs.tz)}
                    {isOverdue && ' · overdue'}
                  </span>
                )}
                <EntryTimestamp occurredAt={t.created_at} className="tabular-nums" />
                {isOverdue && t.nudge_muted_at && (
                  <span className="inline-flex items-center" aria-label="Reminders muted">
                    <BellOff className="size-3.5" />
                  </span>
                )}
              </span>
            </span>
          </div>
          <RowMenu
            label={`Actions for task: ${t.title.slice(0, 30)}${t.title.length > 30 ? '…' : ''}`}
            open={menuFor === t.id}
            onOpenChange={o => setMenuFor(o ? t.id : null)}
            items={[
              ...(onEdit ? [{ label: 'Edit', icon: Pencil, onSelect: () => onEdit(t) }] : []),
              ...(isOverdue ? [{ label: t.nudge_muted_at ? 'Resume reminding' : 'Stop reminding', icon: t.nudge_muted_at ? Bell : BellOff, onSelect: () => toggleMute(t) }] : []),
              { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => deleteTask(t) },
            ]}
          />
        </SwipeRow>

      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <Empty className="items-start px-0 py-6 text-left">
        <EmptyDescription>
          {filter === 'open' && 'No open tasks. Add one by saying or typing "remind me to…"'}
          {filter === 'completed' && 'No completed tasks yet.'}
          {filter === 'all' && 'No tasks yet.'}
        </EmptyDescription>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-7">
      {groups.map(group => (
        <section key={group.key} aria-labelledby={`task-group-${group.key}`} className="flex flex-col">
          <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2.5">
            <h3 id={`task-group-${group.key}`} className="text-[17px] font-bold tracking-[-0.02em] lg:text-[19px]">{group.label}</h3>
            {group.note && <p className="text-[13px] font-semibold text-warning lg:text-sm">{group.note}</p>}
          </div>
          <ul className="flex flex-col">
            {group.nodes.map(node => {
              const parentDone = !!node.completed_at
              return (
                <li key={node.id} className="flex flex-col border-b border-border">
                  {renderRow(node, node)}
                  {node.children.length > 0 && (
                    <ul className="ml-[38px] flex flex-col">
                      {node.children.map(c => <li key={c.id}>{renderRow(c)}</li>)}
                    </ul>
                  )}
                  {!parentDone && <SubtaskAdd parentId={node.id} onAdd={addSubtask} />}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

type GroupKey = 'overdue' | 'today' | 'week' | 'later' | 'none' | 'done'
type TaskGroup = { key: GroupKey; label: string; note?: string; nodes: TaskNode[] }

const GROUP_LABELS: Record<GroupKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  week: 'This week',
  later: 'Later',
  none: 'No due date',
  done: 'Done',
}
const GROUP_ORDER: GroupKey[] = ['overdue', 'today', 'week', 'later', 'none', 'done']
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Split the already filtered and sorted tasks into the ruled sections of the list.
 * Presentation only: the order inside each section is the order the list was given.
 */
function groupByDue(nodes: TaskNode[], now: Date): TaskGroup[] {
  const nowMs = now.getTime()
  const tomorrow = new Date(now); tomorrow.setHours(0, 0, 0, 0); tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowMs = tomorrow.getTime()
  const weekEndMs = tomorrowMs + 6 * DAY_MS
  const buckets = new Map<GroupKey, TaskNode[]>()
  let oldestOverdueMs = nowMs

  for (const node of nodes) {
    const progress = subtaskProgress(node)
    const done = progress ? progress.done === progress.total : !!node.completed_at
    let key: GroupKey
    if (done) key = 'done'
    else if (!node.due_at) key = 'none'
    else {
      const dueMs = new Date(node.due_at).getTime()
      if (dueMs < nowMs) { key = 'overdue'; oldestOverdueMs = Math.min(oldestOverdueMs, dueMs) }
      else if (dueMs < tomorrowMs) key = 'today'
      else if (dueMs < weekEndMs) key = 'week'
      else key = 'later'
    }
    const list = buckets.get(key)
    if (list) list.push(node)
    else buckets.set(key, [node])
  }

  const daysLate = Math.floor((nowMs - oldestOverdueMs) / DAY_MS)
  const overdueCount = buckets.get('overdue')?.length ?? 0
  const lateNote = daysLate < 1
    ? undefined
    : `${overdueCount > 1 ? 'Up to ' : ''}${daysLate} ${daysLate === 1 ? 'day' : 'days'} late`

  return GROUP_ORDER.flatMap(key => {
    const list = buckets.get(key)
    return list ? [{ key, label: GROUP_LABELS[key], note: key === 'overdue' ? lateNote : undefined, nodes: list }] : []
  })
}

function SubtaskAdd({ parentId, onAdd }: { parentId: string; onAdd: (parentId: string, title: string) => void }) {
  const [title, setTitle] = useState('')
  return (
    <div className="ml-[38px] flex items-center gap-2">
      <Plus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <Input
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd(parentId, title); setTitle('') } }}
        placeholder="add sub-task…"
        aria-label="Add sub-task"
        className="h-11 flex-1 rounded-none border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0 md:text-[13px] lg:h-9"
      />
    </div>
  )
}
