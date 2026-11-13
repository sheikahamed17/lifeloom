'use client'

import { useState, useMemo } from 'react'
import { Circle, CheckCircle2, Trash2, Repeat, Plus, Pencil, Bell, BellOff } from 'lucide-react'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { taskCompletionOps, formatRecurrence } from '@/lib/recurring-task'
import { groupTasks, subtaskProgress, rollupOps, visibleNodes, type TaskNode } from '@/lib/subtasks'
import { SwipeRow } from '@/components/swipe-row'
import { RowMenu } from '@/components/row-menu'
import { useUndo } from '@/components/undo-provider'
import { resurrectPayload } from '@/lib/undo-delete'
import { useTasks, type TaskFilter } from '@/hooks/use-tasks'
import { useProjects } from '@/hooks/use-projects'
import { formatLocalDateTime } from '@/lib/format'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { EntryTimestamp } from '@/components/entry-timestamp'
import { sortTasks, type TaskSort } from '@/lib/list-sort'
import { db, type TaskRow } from '@/lib/dexie'

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
    return (
      <div id={`pulse-row-${t.id}`} className="relative">
        <SwipeRow
          isOpen={openId === t.id}
          onOpenChange={o => setOpenId(o ? t.id : null)}
          onTap={onEdit ? () => onEdit(t) : undefined}
          onLongPress={() => setMenuFor(t.id)}
          onDelete={() => deleteTask(t)}
          deleteLabel={`Delete task: ${t.title.slice(0, 30)}${t.title.length > 30 ? '…' : ''}`}
          className="glass-soft flex items-start justify-between gap-3 rounded-2xl p-3"
        >
          {/* The circle completes the task; a tap anywhere else on the row opens the editor. */}
          <button
            type="button"
            onClick={() => { if (!hasChildren) toggleComplete(t) }}
            className="-my-2 -ml-2 flex size-11 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-2 aria-disabled:cursor-default"
            aria-label={hasChildren ? `${t.title}: ${progress!.done} of ${progress!.total} sub-tasks done` : (isCompleted ? `Mark "${t.title}" open` : `Complete "${t.title}"`)}
            aria-disabled={hasChildren}
          >
            {isCompleted ? (
              <CheckCircle2 className="size-5 text-accent-2" aria-hidden />
            ) : (
              <Circle className="size-5 text-muted-foreground" aria-hidden />
            )}
          </button>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className={`md:text-base ${isCompleted ? 'text-muted-foreground line-through' : ''}`}>
                {t.title}
                {progress && <span className="ml-2 font-mono tabular-nums text-xs text-muted-foreground">{progress.done}/{progress.total}</span>}
              </span>
              <span className="text-xs text-muted-foreground">
                {t.recur_period && t.recur_interval && (
                  <span className="mr-2 inline-flex items-center gap-0.5 text-accent-2">
                    <Repeat className="h-3 w-3" /> {formatRecurrence(t.recur_period, t.recur_interval)}
                  </span>
                )}
                {t.project_id && projectById.get(t.project_id) && (
                  <span className="mr-2 inline-flex items-center gap-1">
                    {projectById.get(t.project_id)!.color && (
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: projectById.get(t.project_id)!.color! }} />
                    )}
                    {projectById.get(t.project_id)!.name}
                  </span>
                )}
                {(t.tags ?? []).map(tg => (
                  <span key={tg} className="mr-1 text-accent-2">#{tg}</span>
                ))}
                {t.priority !== 'medium' && (
                  <span className={`mr-2 ${t.priority === 'high' ? 'text-destructive' : ''}`}>
                    {t.priority}
                  </span>
                )}
                {t.due_at && (
                  <span className={`font-mono tabular-nums ${isOverdue ? 'text-warning' : ''}`}>
                    due {formatLocalDateTime(t.due_at, prefs.tz)}
                    {isOverdue && ' · overdue'}
                  </span>
                )}
                <EntryTimestamp occurredAt={t.created_at} className="ml-2 font-mono tabular-nums" />
                {isOverdue && t.nudge_muted_at && (
                  <span className="ml-1 inline-flex items-center align-middle" aria-label="Reminders muted">
                    <BellOff className="h-3 w-3" />
                  </span>
                )}
              </span>
            </div>
          <div className="-my-2 -mr-2">
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
          </div>
        </SwipeRow>

      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="glass-soft rounded-2xl p-4 text-center text-sm text-muted-foreground">
        {filter === 'open' && 'No open tasks. Add one by saying or typing "remind me to…"'}
        {filter === 'completed' && 'No completed tasks yet.'}
        {filter === 'all' && 'No tasks yet.'}
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {nodes.map(node => {
        const parentDone = !!node.completed_at
        return (
          <li key={node.id} className="flex flex-col gap-1">
            {renderRow(node, node)}
            {node.children.length > 0 && (
              <ul className="ml-6 flex flex-col gap-1">
                {node.children.map(c => <li key={c.id}>{renderRow(c)}</li>)}
              </ul>
            )}
            {!parentDone && <SubtaskAdd parentId={node.id} onAdd={addSubtask} />}
          </li>
        )
      })}
    </ul>
  )
}

function SubtaskAdd({ parentId, onAdd }: { parentId: string; onAdd: (parentId: string, title: string) => void }) {
  const [title, setTitle] = useState('')
  return (
    <div className="ml-6 flex items-center gap-1">
      <Plus className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd(parentId, title); setTitle('') } }}
        placeholder="add sub-task…"
        aria-label="Add sub-task"
        className="flex-1 bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/60 focus-visible:text-foreground outline-none py-1"
      />
    </div>
  )
}
