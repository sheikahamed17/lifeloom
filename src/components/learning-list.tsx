'use client'

import { useMemo, useState } from 'react'
import { Trash2, Pencil } from 'lucide-react'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useLearnings } from '@/hooks/use-learnings'
import { SwipeRow } from '@/components/swipe-row'
import { RowMenu } from '@/components/row-menu'
import { useUndo } from '@/components/undo-provider'
import { resurrectPayload } from '@/lib/undo-delete'
import { EntryTimestamp } from '@/components/entry-timestamp'
import { sortByDate, type DateSort } from '@/lib/list-sort'
import type { LearningRow } from '@/lib/dexie'
import { cn } from '@/lib/utils'

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

  if (sorted.length === 0) {
    return (
      <div className="glass-soft rounded-2xl p-4 text-center text-sm text-muted-foreground">
        {selectedTag ? `No learnings with tag "${selectedTag}".` : "No learnings yet — say 'I learned…'"}
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {sorted.map(e => (
        <li key={e.id} id={`pulse-row-${e.id}`} className="relative">
          <SwipeRow
            isOpen={openId === e.id}
            onOpenChange={o => setOpenId(o ? e.id : null)}
            onTap={onEdit ? () => onEdit(e) : undefined}
            onLongPress={() => setMenuFor(e.id)}
            onDelete={() => deleteLearning(e)}
            deleteLabel={`Delete learning: ${e.text.slice(0, 30)}${e.text.length > 30 ? '…' : ''}`}
            className="glass-soft rounded-2xl flex flex-col gap-2 p-3"
          >
            <div className="flex items-start gap-2">
              <p className="flex-1 text-sm md:text-base">{e.text}</p>
              <div className="-mr-2 -mt-2">
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
            </div>
            {(e.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {(e.tags ?? []).map(tag => (
                  <span
                    key={tag}
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      selectedTag === tag
                        ? 'bg-accent-2/30 text-accent-2 border border-accent-2/50'
                        : 'bg-white/10 text-muted-foreground border border-white/20',
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
              <div className="flex items-center gap-2">
                {e.attribution && (
                  <span className="truncate">— {e.attribution}</span>
                )}
              </div>
              <EntryTimestamp occurredAt={e.occurred_at} />
            </div>
          </SwipeRow>
        </li>
      ))}
    </ul>
  )
}
