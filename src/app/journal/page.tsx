'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { useJournal } from '@/hooks/use-journal'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { formatDay } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import { Field, FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PageShell } from '@/components/layout/page-shell'
import type { JournalRow } from '@/lib/dexie'

// The stored value stays the emoji (unchanged data); each mood gets a visible word.
const MOODS = [
  { value: '😀', label: 'Great' },
  { value: '🙂', label: 'Good' },
  { value: '😐', label: 'Okay' },
  { value: '😕', label: 'Low' },
  { value: '😢', label: 'Sad' },
] as const

// Some entries (the demo seed) store the mood as a word; read those onto the same scale.
const MOOD_WORDS: Record<string, string> = { great: '😀', good: '🙂', ok: '😐', okay: '😐', low: '😕', sad: '😢' }

function findMood(stored: string | null | undefined) {
  if (!stored) return undefined
  const value = MOOD_WORDS[stored.trim().toLowerCase()] ?? stored
  return MOODS.find(m => m.value === value)
}

export default function JournalPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const { prefs } = useUserPrefs()
  const [body, setBody] = useState('')
  const [mood, setMood] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else {
        setUserId(res.data.user.id)
        setDate(new Date().toISOString().split('T')[0])
      }
    })
  }, [router])

  const entries = useJournal(userId ?? undefined)

  function resetForm() {
    setBody('')
    setMood(null)
    setEditingId(null)
    setDate(new Date().toISOString().split('T')[0])
  }

  async function save() {
    if (!userId || !body.trim() || !date) return
    const occurredAt = new Date(date + 'T12:00:00').toISOString()
    const op = editingId
      ? await generateOp({
          entity_kind: 'journal', entity_id: editingId, op_type: 'update',
          payload: { body: body.trim(), mood, occurred_at: occurredAt },
          user_id: userId,
        })
      : await generateOp({
          entity_kind: 'journal', entity_id: crypto.randomUUID(), op_type: 'create',
          payload: { body: body.trim(), mood, occurred_at: occurredAt, source: 'manual' },
          user_id: userId,
        })
    await applyLocalOp(op)
    resetForm()
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  function startEdit(e: JournalRow) {
    setEditingId(e.id)
    setBody(e.body)
    setMood(e.mood ?? null)
    setDate(e.occurred_at.slice(0, 10))
  }

  async function remove(id: string) {
    if (!userId) return
    const op = await generateOp({ entity_kind: 'journal', entity_id: id, op_type: 'delete', payload: {}, user_id: userId })
    await applyLocalOp(op)
    if (editingId === id) resetForm()
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  if (!userId) {
    return (
      <PageShell title="Journal">
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden />Loading…</p>
      </PageShell>
    )
  }

  const selectedMood = findMood(mood)?.value

  return (
    <PageShell title="Journal">
      <Card role="region" aria-label="Write an entry">
        <CardContent>
          <FieldGroup className="gap-3">
            <Field>
              <Textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="How was your day?"
                rows={4}
                aria-label="Journal entry"
                className="glass-soft resize-none px-3"
              />
            </Field>
            <ToggleGroup
              aria-label="Mood"
              spacing={1}
              className="grid w-full grid-cols-5"
              value={selectedMood ? [selectedMood] : []}
              onValueChange={next => setMood(next[0] ?? null)}
            >
              {MOODS.map(m => (
                <ToggleGroupItem
                  key={m.value}
                  value={m.value}
                  variant="outline"
                  className="h-auto min-h-14 flex-col gap-0.5 text-xs aria-pressed:border-accent-2 aria-pressed:bg-accent-2/15 aria-pressed:font-medium aria-pressed:text-foreground"
                >
                  <span aria-hidden="true" className="text-xl leading-none">{m.value}</span>
                  {m.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Field orientation="horizontal" className="flex-wrap">
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                aria-label="Entry date"
                className="w-auto"
              />
              <Button onClick={save} disabled={!body.trim()} className="flex-1">
                {editingId ? 'Save changes' : 'Add entry'}
              </Button>
              {editingId && <Button variant="ghost" onClick={resetForm}>Cancel</Button>}
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card role="region" aria-labelledby="journal-entries">
        <CardHeader>
          <CardTitle><h2 id="journal-entries" className="text-sm font-semibold text-muted-foreground">Entries</h2></CardTitle>
        </CardHeader>
        <CardContent>
        {entries.length === 0 && (
          <Empty className="border p-4">
            <EmptyHeader><EmptyDescription>No journal entries yet. Write your first above.</EmptyDescription></EmptyHeader>
          </Empty>
        )}
        <ul className="divide-y divide-border">
          {entries.map(e => {
            const day = formatDay(e.occurred_at, prefs.tz)
            const entryMood = findMood(e.mood)
            return (
              <li key={e.id} className="flex flex-col gap-1 py-3 first:pt-1 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">{day}</span>
                    {entryMood ? (
                      <span className="inline-flex items-center gap-1">
                        <span aria-hidden="true" className="text-base leading-none">{entryMood.value}</span>
                        {entryMood.label}
                      </span>
                    ) : e.mood ? (
                      <span>{e.mood}</span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button variant="ghost" className="px-3 text-muted-foreground hover:text-foreground" onClick={() => startEdit(e)} aria-label={`Edit entry from ${day}`}>
                      Edit
                    </Button>
                    <Button variant="ghost" className="px-3 text-muted-foreground hover:text-destructive" onClick={() => remove(e.id)} aria-label={`Delete entry from ${day}`}>
                      Delete
                    </Button>
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{e.body}</p>
              </li>
            )
          })}
        </ul>
        </CardContent>
      </Card>
    </PageShell>
  )
}
