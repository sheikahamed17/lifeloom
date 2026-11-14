'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { useJournal } from '@/hooks/use-journal'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { formatDay } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PageShell } from '@/components/layout/page-shell'
import type { JournalRow } from '@/lib/dexie'

const LABEL = 'text-[13px] font-semibold text-muted-foreground'

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
      <PageShell title="Journal" description="A few lines a day, with how it felt.">
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden />Loading…</p>
      </PageShell>
    )
  }

  const selectedMood = findMood(mood)?.value

  return (
    <PageShell title="Journal" width="wide" description="A few lines a day, with how it felt.">
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.75fr)] lg:items-start lg:gap-x-14">
        <section role="region" aria-label="Write an entry" className="flex flex-col gap-4">
          <h2 className="hidden border-b border-border pb-2.5 text-[22px] font-bold leading-snug tracking-[-0.02em] lg:block">Write an entry</h2>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="journal-body" className={LABEL}>How was your day?</FieldLabel>
              <Textarea
                id="journal-body"
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={4}
                aria-label="Journal entry"
                className="min-h-30 resize-none text-[15px] leading-normal"
              />
            </Field>
            <Field>
              <span className={LABEL}>Mood</span>
              <ToggleGroup
                aria-label="Mood"
                spacing={1.5}
                className="grid w-full grid-cols-5"
                value={selectedMood ? [selectedMood] : []}
                onValueChange={next => setMood(next[0] ?? null)}
              >
                {MOODS.map(m => (
                  <ToggleGroupItem
                    key={m.value}
                    value={m.value}
                    className="h-12 min-w-0 rounded-xl bg-card px-0 text-sm font-medium text-foreground hover:bg-card aria-pressed:bg-foreground aria-pressed:font-bold aria-pressed:text-background aria-pressed:hover:bg-foreground aria-pressed:hover:text-background"
                  >
                    {m.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <div className="flex flex-wrap items-end gap-2">
              <Field className="w-40 shrink-0">
                <FieldLabel htmlFor="journal-date" className={LABEL}>Entry date</FieldLabel>
                <Input
                  id="journal-date"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  aria-label="Entry date"
                />
              </Field>
              <Button onClick={save} disabled={!body.trim()} className="h-12 min-w-0 flex-1">
                {editingId ? 'Save changes' : 'Add entry'}
              </Button>
              {editingId && <Button variant="outline" className="h-12" onClick={resetForm}>Cancel</Button>}
            </div>
          </FieldGroup>
        </section>

        <section role="region" aria-labelledby="journal-entries" className="flex min-w-0 flex-col">
          <div className="flex items-end justify-between gap-4 border-b border-border pb-2.5">
            <h2 id="journal-entries" className="text-[19px] font-bold leading-snug tracking-[-0.02em] lg:text-[22px]">Entries</h2>
            {entries.length > 0 && (
              <span className="text-[13px] text-muted-foreground lg:text-sm">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
            )}
          </div>
          {entries.length === 0 && (
            <p className="pt-3.5 text-[15px] text-muted-foreground">No journal entries yet. Write your first above.</p>
          )}
          <ul className="flex flex-col">
            {entries.map(e => {
              const day = formatDay(e.occurred_at, prefs.tz)
              const entryMood = findMood(e.mood)
              const moodWord = entryMood ? entryMood.label : e.mood ? e.mood : null
              return (
                <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center border-b border-border pb-3.5 pt-1 lg:grid-cols-[7.5rem_minmax(0,1fr)_auto] lg:items-start lg:gap-x-4 lg:py-1">
                  <span className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground lg:flex-col lg:items-start lg:gap-y-0.5 lg:py-3">
                    <span className="font-semibold tabular-nums text-foreground">{day}</span>
                    {moodWord && (
                      <>
                        <span aria-hidden="true" className="lg:hidden">·</span>
                        <span>{moodWord}</span>
                      </>
                    )}
                  </span>
                  <p className="col-span-2 row-start-2 whitespace-pre-wrap text-[15px] leading-normal lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:py-[11px] lg:leading-[1.55]">{e.body}</p>
                  <span className="col-start-2 row-start-1 flex shrink-0 gap-1 lg:col-start-3">
                    <Button variant="link" className="h-11 px-2 text-sm" onClick={() => startEdit(e)} aria-label={`Edit entry from ${day}`}>
                      Edit
                    </Button>
                    <Button variant="link" className="h-11 pl-2 pr-0 text-sm text-destructive" onClick={() => remove(e.id)} aria-label={`Delete entry from ${day}`}>
                      Delete
                    </Button>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </PageShell>
  )
}
