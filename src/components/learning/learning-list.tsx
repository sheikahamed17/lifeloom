'use client'

import { useMemo, useState } from 'react'
import { Trash2, Pencil } from 'lucide-react'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useLearnings } from '@/hooks/use-learnings'
import { SwipeRow } from '@/components/shared/swipe-row'
import { RowMenu } from '@/components/shared/row-menu'
import { useUndo } from '@/components/providers/undo-provider'
import { resurrectPayload } from '@/lib/undo-delete'
import { EntryTimestamp } from '@/components/money/entry-timestamp'
import { sortByDate, type DateSort } from '@/lib/list-sort'
import type { LearningRow } from '@/lib/dexie'
import { cn } from '@/lib/utils'
import { Empty, EmptyDescription } from '@/components/ui/empty'

type Props = { userId: string; selectedTag: string | null; sort?: DateSort; onEdit?: (row: LearningRow) => void }

export function LearningList({ userId, selectedTag, sort = 'newest', onEdit }: Props) {
  const learnings = useLearnings(userId)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const undo = useUndo()

  const sorted = useMemo(() => {
    const filtered = selectedTag
      ? learnings.filter(e => (e.tags ?? []).includes(selectedTag))
      : learnings
    return sortByDate(filtered, sort)
  }, [learnings, selectedTag, sort])

  async function deleteLearning(e: LearningRow) {
    const op = await generateOp({
      entity_kind: 'learning', entity_id: e.id,
      op_type: 'delete', payload: {},
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    setMenuFor(null)
    undo.push('Deleted learning', async () => {
      const undoOp = await generateOp({
        entity_kind: 'learning', entity_id: e.id,
        op_type: 'update', payload: resurrectPayload('learning', e),
        user_id: userId,
      })
      await applyLocalOp(undoOp)
      pushPullOnce({ userId }).catch(err => console.error('sync', err))
    })
  }

  // Presentation only: the same seven-day window the summary counts as "this week".
  const groups = useMemo(() => {
    const weekAgo = new Date().getTime() - 7 * 24 * 60 * 60 * 1000
    const out: { key: string; label: string; rows: LearningRow[] }[] = []
    for (const e of sorted) {
      const key = new Date(e.occurred_at).getTime() >= weekAgo ? 'week' : 'earlier'
      const group = out.find(g => g.key === key)
      if (group) group.rows.push(e)
      else out.push({ key, label: key === 'week' ? 'This week' : 'Earlier', rows: [e] })
    }
    return out
  }, [sorted])

  if (sorted.length === 0) {
    return (
      <Empty className="items-start px-0 py-6 text-left">
        <EmptyDescription>
          {selectedTag ? `No learnings with tag "${selectedTag}".` : "No learnings yet. Say 'I learned…'"}
        </EmptyDescription>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-7">
      {groups.map(group => (
        <section key={group.key} aria-labelledby={`learning-group-${group.key}`} className="flex flex-col">
          <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2.5">
            <h3 id={`learning-group-${group.key}`} className="text-[17px] font-bold tracking-[-0.02em] lg:text-[19px]">{group.label}</h3>
            <p className="text-[13px] tabular-nums text-muted-foreground lg:text-sm">{group.rows.length} {group.rows.length === 1 ? 'learning' : 'learnings'}</p>
          </div>
          <ul className="flex flex-col">
            {group.rows.map(e => (
              // The swipe layer clips its content, so it is pulled 12px wider than the column
              // and the rule is drawn by the list item outside it.
              <li key={e.id} className="border-b border-border">
                <div id={`pulse-row-${e.id}`} className="relative -mx-3">
                  <SwipeRow
                    isOpen={openId === e.id}
                    onOpenChange={o => setOpenId(o ? e.id : null)}
                    onTap={onEdit ? () => onEdit(e) : undefined}
                    onLongPress={() => setMenuFor(e.id)}
                    onDelete={() => deleteLearning(e)}
                    deleteLabel={`Delete learning: ${e.text.slice(0, 30)}${e.text.length > 30 ? '…' : ''}`}
                    className="flex items-start gap-2 pb-3 pl-3 pr-1 pt-3.5 lg:gap-4 lg:pb-3.5 lg:pt-4"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <p className="text-[15px] font-medium leading-[1.45] lg:text-base">{e.text}</p>
                      <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground lg:text-sm">
                        <p className="flex min-w-0 flex-wrap gap-x-1.5 empty:hidden">
                          {e.attribution && <span className="truncate">From {e.attribution}</span>}
                          {(e.tags ?? []).map(tag => (
                            <span key={tag} className={cn(selectedTag === tag && 'font-semibold text-foreground')}>#{tag}</span>
                          ))}
                        </p>
                        <EntryTimestamp occurredAt={e.occurred_at} className="tabular-nums lg:hidden" />
                      </div>
                    </div>
                    <EntryTimestamp occurredAt={e.occurred_at} className="hidden shrink-0 pt-0.5 text-sm tabular-nums text-muted-foreground lg:block" />
                    <div className="-mt-2 shrink-0">
                      <RowMenu
                        label={`Actions for learning: ${e.text.slice(0, 30)}${e.text.length > 30 ? '…' : ''}`}
                        open={menuFor === e.id}
                        onOpenChange={o => setMenuFor(o ? e.id : null)}
                        items={[
                          ...(onEdit ? [{ label: 'Edit', icon: Pencil, onSelect: () => onEdit(e) }] : []),
                          { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => deleteLearning(e) },
                        ]}
                      />
                    </div>
                  </SwipeRow>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
