'use client'

import { useMemo, useState } from 'react'
import { Trash2, Pencil } from 'lucide-react'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useNotes } from '@/hooks/use-notes'
import { SwipeRow } from '@/components/shared/swipe-row'
import { RowMenu } from '@/components/shared/row-menu'
import { useUndo } from '@/components/providers/undo-provider'
import { resurrectPayload } from '@/lib/undo-delete'
import { searchNotes } from '@/lib/search-notes'
import { EntryTimestamp } from '@/components/money/entry-timestamp'
import { sortByDate, type DateSort } from '@/lib/list-sort'
import type { NoteRow } from '@/lib/dexie'
import { cn } from '@/lib/utils'
import { Empty, EmptyDescription } from '@/components/ui/empty'

type Props = { userId: string; selectedTag: string | null; searchQuery?: string; sort?: DateSort; onEdit?: (row: NoteRow) => void }

function truncatePreview(text: string, maxChars: number = 100): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '…'
}

export function NotesList({ userId, selectedTag, searchQuery = '', sort = 'newest', onEdit }: Props) {
  const notes = useNotes(userId)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const undo = useUndo()

  const sorted = useMemo(() => {
    const searched = searchNotes(notes, searchQuery)
    const filtered = selectedTag
      ? searched.filter(e => (e.tags ?? []).includes(selectedTag))
      : searched
    return sortByDate(filtered, sort)
  }, [notes, searchQuery, selectedTag, sort])

  async function deleteNote(e: NoteRow) {
    const op = await generateOp({
      entity_kind: 'note', entity_id: e.id,
      op_type: 'delete', payload: {},
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    setMenuFor(null)
    undo.push('Deleted note', async () => {
      const undoOp = await generateOp({
        entity_kind: 'note', entity_id: e.id,
        op_type: 'update', payload: resurrectPayload('note', e),
        user_id: userId,
      })
      await applyLocalOp(undoOp)
      pushPullOnce({ userId }).catch(err => console.error('sync', err))
    })
  }

  if (sorted.length === 0) {
    return (
      <Empty className="items-start px-0 py-6 text-left">
        <EmptyDescription>
          {selectedTag ? `No notes with tag "${selectedTag}".` : "No notes yet. Say 'note that…'"}
        </EmptyDescription>
      </Empty>
    )
  }

  return (
    <ul className="flex flex-col">
      {sorted.map(e => (
        // The swipe layer clips its content, so it is pulled 12px wider than the column
        // and the rule is drawn by the list item outside it.
        <li key={e.id} className="border-b border-border">
          <div id={`pulse-row-${e.id}`} className="relative -mx-3">
            <SwipeRow
              isOpen={openId === e.id}
              onOpenChange={o => setOpenId(o ? e.id : null)}
              onTap={onEdit ? () => onEdit(e) : undefined}
              onLongPress={() => setMenuFor(e.id)}
              onDelete={() => deleteNote(e)}
              deleteLabel={`Delete note: ${(e.title || e.body).slice(0, 30)}${(e.title || e.body).length > 30 ? '…' : ''}`}
              className="flex items-start gap-2 pb-3 pl-3 pr-1 pt-3.5 lg:gap-4 lg:pb-3.5 lg:pt-4"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-[15px] font-semibold lg:text-base">{e.title || truncatePreview(e.body)}</p>
                {e.title && (
                  <p className="line-clamp-2 text-[13px] leading-[1.45] text-muted-foreground lg:text-sm">{truncatePreview(e.body, 150)}</p>
                )}
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 pt-0.5 text-[13px] text-muted-foreground">
                  <p className="flex min-w-0 flex-wrap gap-x-1.5 empty:hidden">
                    {(e.tags ?? []).map(tag => (
                      <span key={tag} className={cn(selectedTag === tag && 'font-semibold text-foreground')}>#{tag}</span>
                    ))}
                  </p>
                  <EntryTimestamp occurredAt={e.occurred_at} className="tabular-nums lg:hidden" />
                </div>
              </div>
              <EntryTimestamp occurredAt={e.occurred_at} className="hidden shrink-0 pt-0.5 text-sm tabular-nums text-muted-foreground lg:block" />
              <div className="-mt-2.5 shrink-0">
                <RowMenu
                  label={`Actions for note: ${(e.title || e.body).slice(0, 30)}${(e.title || e.body).length > 30 ? '…' : ''}`}
                  open={menuFor === e.id}
                  onOpenChange={o => setMenuFor(o ? e.id : null)}
                  items={[
                    ...(onEdit ? [{ label: 'Edit', icon: Pencil, onSelect: () => onEdit(e) }] : []),
                    { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => deleteNote(e) },
                  ]}
                />
              </div>
            </SwipeRow>
          </div>
        </li>
      ))}
    </ul>
  )
}
