'use client'

import { useMemo, useState } from 'react'
import { Trash2, Pencil } from 'lucide-react'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useNotes } from '@/hooks/use-notes'
import { SwipeRow } from '@/components/swipe-row'
import { RowMenu } from '@/components/row-menu'
import { useUndo } from '@/components/undo-provider'
import { resurrectPayload } from '@/lib/undo-delete'
import { searchNotes } from '@/lib/search-notes'
import { EntryTimestamp } from '@/components/entry-timestamp'
import { sortByDate, type DateSort } from '@/lib/list-sort'
import type { NoteRow } from '@/lib/dexie'
import { cn } from '@/lib/utils'

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
      <div className="glass-soft rounded-2xl p-4 text-center text-sm text-muted-foreground">
        {selectedTag ? `No notes with tag "${selectedTag}".` : "No notes yet — say 'note that…'"}
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
            onDelete={() => deleteNote(e)}
            deleteLabel={`Delete note: ${(e.title || e.body).slice(0, 30)}${(e.title || e.body).length > 30 ? '…' : ''}`}
            className="glass-soft rounded-2xl flex flex-col gap-2 p-3"
          >
            <div className="flex items-start gap-2">
              <p className="flex-1 text-sm md:text-base font-medium">{e.title || truncatePreview(e.body)}</p>
              <div className="-mr-2 -mt-2">
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
            </div>
            {e.title && (
              <p className="text-xs text-muted-foreground line-clamp-2">{truncatePreview(e.body, 150)}</p>
            )}
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
            <div className="flex items-center justify-end text-xs text-muted-foreground">
              <EntryTimestamp occurredAt={e.occurred_at} />
            </div>
          </SwipeRow>
        </li>
      ))}
    </ul>
  )
}
