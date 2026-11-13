'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Settings, Search, LayoutDashboard, CheckCircle2, Sparkles, BookOpen, X } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { LockGate } from '@/components/lock-gate'
import { PulseLogo } from '@/components/pulse-logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuroraBackground } from '@/components/aurora-background'
import { ConfirmationChip, type ChipDraft } from '@/components/confirmation-chip'
import { QueryAnswerCard } from '@/components/query-answer-card'
import { QueryTaskListAnswer, QueryLearningListAnswer, QueryNotesListAnswer } from '@/components/query-answers'
import type { QueryPlan } from '@/lib/query-plans'
import { isQueryPlan } from '@/lib/query-plans'
import { speak, cancelSpeech } from '@/lib/speak'
import { speakableAnswer, type SpokenAnswerInput } from '@/lib/speak-answer'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { MoneyCard } from '@/components/money-card'
import { MoneyList } from '@/components/money-list'
import { MoneyControls } from '@/components/money-controls'
import { DigestCard } from '@/components/digest-card'
import { EMPTY_MONEY_FILTER, type MoneyFilter, type MoneySort } from '@/lib/money-filter-sort'
import { SortControl } from '@/components/sort-control'
import { type DateSort, type TaskSort } from '@/lib/list-sort'
import { BudgetSection } from '@/components/budget-section'
import { CardsSection } from '@/components/cards-section'
import { VoiceRecorder } from '@/components/voice-recorder'
import { ReceiptButton } from '@/components/receipt-button'
import { TabBar } from '@/components/tab-bar'
import { TaskList } from '@/components/task-list'
import { TaskFilter } from '@/components/task-filter'
import { TaskTagFilter } from '@/components/task-tag-filter'
import { ProjectPicker } from '@/components/project-picker'
import { TaskSummary } from '@/components/task-summary'
import { LearningList } from '@/components/learning-list'
import { LearningTagFilter } from '@/components/learning-tag-filter'
import { LearningSummary } from '@/components/learning-summary'
import { NotesSummary } from '@/components/notes-summary'
import { NotesList } from '@/components/notes-list'
import { NotesTagFilter } from '@/components/notes-tag-filter'
import { useTabState } from '@/hooks/use-tab-state'
import { useCategories } from '@/hooks/use-categories'
import { useTasks, type TaskFilter as TaskFilterValue } from '@/hooks/use-tasks'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { db, type MoneyEntryRow, type TaskRow, type LearningRow, type NoteRow } from '@/lib/dexie'
import { moneyRowToDraft, taskRowToDraft, learningRowToDraft, noteRowToDraft } from '@/lib/entry-to-draft'
import { planShareChanges, type ShareDraftRow } from '@/lib/share-edit'
import { owedByPerson, planSettlement } from '@/lib/shares'
import { usePeople } from '@/hooks/use-people'
import { blankDraftForKind } from '@/lib/blank-draft'
import { manualDraftFromText } from '@/lib/manual-draft'
import { useOnline } from '@/hooks/use-online'
import { useQueuedCount } from '@/hooks/use-queued-count'
import { UndoProvider, useUndo } from '@/components/undo-provider'
import { savedLabel } from '@/lib/capture-feedback'
import { GlobalSearch } from '@/components/global-search'
import { TodayNudge } from '@/components/today-nudge'
import { HelpCard } from '@/components/help-card'
import { seedDefaultCategoriesIfEmpty } from '@/lib/seed-categories'
import { runCategoryDedupeOnce } from '@/lib/dedupe-categories-migration'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import type { Allocation } from '@/lib/split-transaction'
import { planSplitOfExisting } from '@/lib/split-edit'
import { drainVoiceQueue } from '@/lib/voice-queue'
import { callVoiceApiStreaming } from '@/lib/voice-sse'
import { drainReceiptQueue } from '@/lib/receipt-queue'
import { callReceiptApiStreaming } from '@/lib/receipt-sse'
import { saveReceiptDraft, listReceiptDrafts, deleteReceiptDraft, pickNextReceiptDraft } from '@/lib/receipt-drafts'
import type { MoneyPayload } from '@/lib/op-schemas/money'
import { computeNextDue } from '@/lib/recurring'
import { withWebLock } from '@/lib/web-lock'

// Delegate to the same engine the cron uses so the FIRST next_due_at clamps
// day-of-month identically to subsequent fires (Jan 31 + 1mo → Feb 28, not
// Mar 3 which raw setUTCMonth would produce).
function nextDueFromAnchor(anchorIso: string, period: 'daily'|'weekly'|'monthly'|'yearly', n: number): string {
  return computeNextDue({
    id: 'tmp',
    period,
    interval_count: n,
    anchor_at: anchorIso,
    next_due_at: anchorIso,
    occurrences_so_far: 0,
    end_condition_kind: 'never',
    end_until: null,
    end_count: null,
    is_active: 1,
  })
}

function AppPageInner() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<ChipDraft | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [categorizeId, setCategorizeId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [drainTick, setDrainTick] = useState(0)
  const [queryPlan, setQueryPlan] = useState<QueryPlan | null>(null)
  const [querySource, setQuerySource] = useState<'voice' | 'text' | null>(null)
  const [parsing, setParsing] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  // Unplaced input is never wiped silently (critique P0): the text stays and this explains.
  const [captureNotice, setCaptureNotice] = useState<null | 'unplaced' | 'unreachable'>(null)
  const undo = useUndo()
  const [activeTab, setTab] = useTabState()
  const { prefs } = useUserPrefs()
  const searchParams = useSearchParams()
  const online = useOnline()
  const queuedCount = useQueuedCount()

  // Global search "jump to row": after switching tabs, scroll the target row into
  // view + flash it. Retries because the destination list renders async (useLiveQuery).
  useEffect(() => {
    if (!focusId) return
    let tries = 0
    const timers: ReturnType<typeof setTimeout>[] = []
    const tryScroll = () => {
      const el = document.getElementById(`pulse-row-${focusId}`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        el.classList.add('pulse-flash')
        // NOT pushed to `timers`: setFocusId(null) below re-runs this effect, whose
        // cleanup clears `timers`. The removal must survive that so the class is
        // actually removed (else a later jump to the same row can't re-animate).
        setTimeout(() => el.classList.remove('pulse-flash'), 1200)
        setFocusId(null)
        return
      }
      if (tries++ < 8) timers.push(setTimeout(tryScroll, 120))
      else setFocusId(null)
    }
    timers.push(setTimeout(tryScroll, 0))
    return () => { timers.forEach(clearTimeout) }
  }, [focusId, activeTab])
  const [taskFilter, setTaskFilter] = useState<TaskFilterValue>('open')
  const [taskProjectId, setTaskProjectId] = useState<string | null>(null)
  const [taskTag, setTaskTag] = useState<string | null>(null)
  const [taskSort, setTaskSort] = useState<TaskSort>('due')
  const [selectedLearningTag, setSelectedLearningTag] = useState<string | null>(null)
  const [learningSort, setLearningSort] = useState<DateSort>('newest')
  const [selectedNotesTag, setSelectedNotesTag] = useState<string | null>(null)
  const [notesSort, setNotesSort] = useState<DateSort>('newest')
  const [notesSearchQuery, setNotesSearchQuery] = useState('')
  const [notesSearchInputValue, setNotesSearchInputValue] = useState('')
  const notesSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { status: pushStatus, subscribe: pushSubscribe } = usePushSubscription()
  const [showPushNudge, setShowPushNudge] = useState(false)
  const [moneyFilter, setMoneyFilter] = useState<MoneyFilter>(EMPTY_MONEY_FILTER)
  const [moneySort, setMoneySort] = useState<MoneySort>('date-desc')

  // Debounce notes search input (~150ms)
  useEffect(() => {
    if (notesSearchDebounceRef.current) clearTimeout(notesSearchDebounceRef.current)
    notesSearchDebounceRef.current = setTimeout(() => {
      setNotesSearchQuery(notesSearchInputValue)
    }, 150)
    return () => {
      if (notesSearchDebounceRef.current) clearTimeout(notesSearchDebounceRef.current)
    }
  }, [notesSearchInputValue])

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUser({ id: res.data.user.id, email: res.data.user.email })
    })
  }, [router])

  useEffect(() => {
    if (!user) return
    seedDefaultCategoriesIfEmpty({ userId: user.id })
      // Sync BEFORE dedupe: push a fresh seed and — crucially for already-seeded
      // accounts (seeder returns 0) — pull the server's existing dupes so the
      // migration sees the full set, not just what this device happened to cache.
      .then(() => pushPullOnce({ userId: user.id }).catch(console.error))
      .then(() => runCategoryDedupeOnce({ userId: user.id }))
      .then(r => { if (r.ran && r.tombstoned > 0) pushPullOnce({ userId: user.id }).catch(console.error) })
      .catch(err => console.error('seed/dedupe', err))
  }, [user])

  // Deep-link from an ingest push: /app?categorize=<id> → open that row's inline
  // category picker on the Money tab, then strip the param. Runs once per id.
  const categorizeHandledRef = useRef<string | null>(null)
  useEffect(() => {
    if (!user) return
    const cid = searchParams.get('categorize')
    if (!cid || categorizeHandledRef.current === cid) return
    categorizeHandledRef.current = cid
    setTab('money')
    setCategorizeId(cid)
    router.replace('/app?tab=money')
  }, [user, searchParams, router, setTab])

  // Periodic sync lives in <BackgroundSync /> (root layout) so every page fills in.

  useEffect(() => {
    if (!user) return
    const onOnline = () => {
      withWebLock('pulse-voice-drain', async () => {
        await drainVoiceQueue({
          processBlob: async (blob) => {
            // Background drain — events are ignored (no UI to update)
            const final = await callVoiceApiStreaming(blob, () => {})
            if (!final) throw new Error('voice drain failed')
            return { ok: true }
          },
          maxRetries: 3,
        })
      }).catch(err => console.error('drain', err))
    }
    window.addEventListener('online', onOnline)
    onOnline()
    return () => window.removeEventListener('online', onOnline)
  }, [user])

  useEffect(() => {
    if (!user) return
    const onOnline = () => {
      withWebLock('pulse-receipt-drain', async () => {
        await drainReceiptQueue({
          processBlob: async (blob) => {
            // Background drain: parse server-side, then PERSIST the parsed money
            // payload as a receipt draft so it survives reload and later surfaces as
            // the confirmation chip (was discarded here). The R2 image is referenced
            // by payload.receipt_key; drainTick nudges the surfacing effect.
            const final = await callReceiptApiStreaming(blob, () => {})
            if (!final) throw new Error('receipt drain failed')
            await saveReceiptDraft(final.payload as MoneyPayload)
            setDrainTick(t => t + 1)
            return { ok: true }
          },
          maxRetries: 3,
        })
      }).catch(err => console.error('receipt drain', err))
    }
    window.addEventListener('online', onOnline)
    onOnline()
    return () => window.removeEventListener('online', onOnline)
  }, [user])

  // Surface a background-drained receipt as the confirmation chip — one at a time,
  // only when the chip slot is free (never clobbers an active edit). Re-runs when
  // `draft` clears (after confirm/cancel) → pops the next drained draft.
  useEffect(() => {
    if (!user || draft !== null || parsing || queryPlan !== null) return
    let cancelled = false
    ;(async () => {
      const next = pickNextReceiptDraft(await listReceiptDrafts())
      if (cancelled || !next) return
      setDraft({
        ...next.payload,
        kind: 'money',
        draftId: next.id,
        receiptPreviewUrl: next.payload.receipt_key ? `/api/receipt/${next.payload.receipt_key}` : undefined,
      } as ChipDraft)
    })()
    return () => { cancelled = true }
  }, [user, draft, parsing, queryPlan, drainTick])

  const categories = useCategories(user?.id)
  const people = usePeople(user?.id)
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  const openTasksForBadge = useTasks(user?.id, 'open')
  const taskBadgeCount = useMemo(() => {
    const now = new Date().toISOString()
    return openTasksForBadge.filter(t => !t.due_at || t.due_at <= now).length
  }, [openTasksForBadge])

  function handleAnswerResult(input: SpokenAnswerInput) {
    if (querySource === 'voice') speak(speakableAnswer(input))
  }

  function dismissQuery() {
    cancelSpeech()
    setQueryPlan(null)
    setQuerySource(null)
  }

  function tabKind(): 'money' | 'task' | 'learning' | 'note' {
    return activeTab === 'tasks' ? 'task' : activeTab === 'learning' ? 'learning' : activeTab === 'notes' ? 'note' : 'money'
  }

  function addManually() {
    setDraft(manualDraftFromText(tabKind(), text, prefs.primary_currency ?? 'INR', new Date().toISOString()))
    setText('')
    setCaptureNotice(null)
  }

  /** Close the capture loop: say what was saved, offer Undo, and scroll to + flash the new row. */
  function announceSaved(label: string, rowId: string | null, revert?: () => Promise<void>) {
    undo.push(label, revert && (async () => {
      await revert()
      if (user) pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
    }))
    if (rowId) setFocusId(rowId)
  }

  async function deleteCreated(kind: 'money' | 'task' | 'learning' | 'note' | 'recurring' | 'budget', ids: string[]) {
    if (!user) return
    for (const id of ids) await applyLocalOp(await generateOp({ entity_kind: kind, entity_id: id, op_type: 'delete', payload: {}, user_id: user.id }))
  }

  async function parseText() {
    if (!text.trim() || !user) return
    setCaptureNotice(null)
    if (!online) {
      setDraft(manualDraftFromText(tabKind(), text.trim(), prefs.primary_currency ?? 'INR', new Date().toISOString()))
      setText('')
      return
    }
    setParsing(true)
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          categories: categories.map(c => ({ id: c.id, name: c.name, kind: c.kind })),
          people: people.map(p => ({ id: p.id, name: p.name })),
        }),
      })
      if (!res.ok) throw new Error(`/api/agent ${res.status}`)
      const data = await res.json() as { intent: string; payload: ChipDraft | QueryPlan | SettleSharePayload | null }

      if (data.intent === 'chat') {
        setShowHelp(true)
        setText('')
        return
      }

      if (!data.payload) {
        setCaptureNotice('unplaced')
        return
      }
      if (isSettleSharePayload(data.payload)) {
        await startSettlement(data.payload)
        setText('')
        return
      }
      if (isQueryPlan(data.payload)) {
        setQueryPlan(data.payload)
        setQuerySource('text')
        setText('')
      } else {
        setDraft(data.payload as ChipDraft)
        setText('')
      }
    } catch (err) {
      console.error(err)
      setCaptureNotice('unreachable')
    } finally {
      setParsing(false)
    }
  }

  async function editMoney(r: MoneyEntryRow) {
    if (draft) return
    // Existing shares ride along so the chip can show / edit them.
    const shares = (await db.expense_shares.where('money_entry_id').equals(r.id).toArray()).filter(s => !s.deleted_at)
    const people = shares.length ? await db.people.where('user_id').equals(r.user_id).toArray() : []
    const nameById = new Map(people.map(p => [p.id, p.name]))
    const shared_with: ShareDraftRow[] = shares.map(s => ({
      share_id: s.id, person_id: s.person_id, name: nameById.get(s.person_id) ?? 'Someone', amount: s.amount, settled: !!s.settled_at,
    }))
    setEditId(r.id)
    setDraft({ ...moneyRowToDraft(r), shared_with })
  }
  function editTask(r: TaskRow) { if (draft) return; setEditId(r.id); setDraft(taskRowToDraft(r)) }
  function editLearning(r: LearningRow) { if (draft) return; setEditId(r.id); setDraft(learningRowToDraft(r)) }
  function editNote(r: NoteRow) { if (draft) return; setEditId(r.id); setDraft(noteRowToDraft(r)) }

  async function updateEntry(final: ChipDraft, id: string) {
    if (!user) return
    let entity_kind: 'money' | 'task' | 'learning' | 'note'
    let payload: Record<string, unknown>
    switch (final.kind) {
      case 'money':
        entity_kind = 'money'
        payload = { amount: final.amount, currency: final.currency, direction: final.direction, category_id: final.category_id ?? null, description: final.description ?? null, merchant: final.merchant ?? null, tags: final.tags ?? [], occurred_at: final.occurred_at, account_id: final.account_id ?? null }
        break
      case 'task':
        entity_kind = 'task'
        payload = { title: final.title, due_at: final.due_at ?? null, priority: final.priority, tags: final.tags ?? [], project_id: final.project_id ?? null }
        break
      case 'learning':
        entity_kind = 'learning'
        payload = { text: final.text, tags: final.tags ?? [], attribution: final.attribution ?? null }
        break
      case 'note':
        entity_kind = 'note'
        payload = { body: final.body, title: final.title ?? null, tags: final.tags ?? [] }
        break
      default:
        setDraft(null); setEditId(null)
        return // budget is not edited via the chip
    }
    const op = await generateOp({ entity_kind, entity_id: id, op_type: 'update', payload, user_id: user.id })
    await applyLocalOp(op)
    if (final.kind === 'money') await applyShareChanges(id, final.direction === 'out' ? (final.shared_with ?? []) : [])
    setDraft(null); setEditId(null)
    announceSaved(savedLabel({ kind: 'edit' }), id)
    pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
  }

  // Split an already-saved money entry: it becomes the first part (same id,
  // receipt and history) and the other allocations are created alongside it in
  // the same split group — the same N-entries shape the create path writes.
  async function splitExistingEntry(final: Extract<ChipDraft, { kind: 'money' }>, id: string, allocations: Allocation[]) {
    if (!user) return
    const plan = planSplitOfExisting({ entryId: id, final, allocations, newId: () => crypto.randomUUID() })
    await applyLocalOp(await generateOp({ entity_kind: 'money', entity_id: plan.update.entity_id, op_type: 'update', payload: plan.update.payload, user_id: user.id }))
    for (const part of plan.creates) {
      await applyLocalOp(await generateOp({ entity_kind: 'money', entity_id: part.entity_id, op_type: 'create', payload: part.payload, user_id: user.id }))
    }
    setDraft(null); setEditId(null)
    announceSaved(savedLabel({ kind: 'money', amount: final.amount, currency: final.currency, direction: final.direction, parts: allocations.length }), null)
    pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
  }

  // "Arun paid me 10000": settle that person's outstanding shares, oldest first,
  // only when they sum EXACTLY to the amount. Otherwise open the People page —
  // never guess which debt it was.
  async function startSettlement(p: SettleSharePayload) {
    if (!user) return
    const match = p.person_id ? people.find(x => x.id === p.person_id) : people.find(x => x.name.trim().toLocaleLowerCase() === p.person_name.trim().toLocaleLowerCase())
    if (!match) { router.push('/settings/people'); return }
    const [entries, shares] = await Promise.all([
      db.money_entries.where('user_id').equals(user.id).toArray(),
      db.expense_shares.where('[user_id+person_id]').equals([user.id, match.id]).toArray(),
    ])
    const row = owedByPerson(entries, shares, [match]).find(r => r.personId === match.id)
    const candidates = (row?.shares ?? []).filter(s => s.currency === p.currency)
    const ids = planSettlement(candidates, p.amount)
    if (!ids) { router.push(`/settings/people#${match.id}`); return }
    const chosen = candidates.filter(s => ids.includes(s.shareId))
    setDraft({
      kind: 'settle', person_id: match.id, person_name: match.name, share_ids: ids, amount: p.amount, currency: p.currency,
      summary: chosen.map(s => s.description || 'entry').join(', '),
    })
  }

  // "Shared with": people who owe part of an entry. Writes the person (when new)
  // and expense_share ops the chip's rows imply; never touches the money payload.
  async function applyShareChanges(entryId: string, rows: ShareDraftRow[]) {
    if (!user) return
    const existing = (await db.expense_shares.where('money_entry_id').equals(entryId).toArray())
    if (rows.length === 0 && existing.every(s => s.deleted_at || s.settled_at)) return
    const people = await db.people.where('user_id').equals(user.id).toArray()
    const plan = planShareChanges({ entryId, existing, rows, people, newId: () => crypto.randomUUID() })
    for (const p of plan.people) await applyLocalOp(await generateOp({ entity_kind: 'person', entity_id: p.entity_id, op_type: 'create', payload: p.payload, user_id: user.id }))
    for (const c of plan.creates) await applyLocalOp(await generateOp({ entity_kind: 'expense_share', entity_id: c.entity_id, op_type: 'create', payload: c.payload, user_id: user.id }))
    for (const u of plan.updates) await applyLocalOp(await generateOp({ entity_kind: 'expense_share', entity_id: u.entity_id, op_type: 'update', payload: u.payload, user_id: user.id }))
    for (const id of plan.deletes) await applyLocalOp(await generateOp({ entity_kind: 'expense_share', entity_id: id, op_type: 'delete', payload: {}, user_id: user.id }))
  }

  async function confirmEntry(
    final: ChipDraft,
    recurring: { enabled: boolean; period: 'daily'|'weekly'|'monthly'|'yearly'; intervalCount: number },
    splitAllocations?: Allocation[],
  ) {
    if (!user) return
    if (final.kind === 'settle') {
      const settled_at = new Date().toISOString()
      for (const id of final.share_ids) {
        await applyLocalOp(await generateOp({ entity_kind: 'expense_share', entity_id: id, op_type: 'update', payload: { settled_at, settled_account_id: final.account_id ?? null }, user_id: user.id }))
      }
      setDraft(null); setEditId(null)
      announceSaved(savedLabel({ kind: 'settle', personName: final.person_name, amount: final.amount, currency: final.currency }), null, async () => {
        for (const id of final.share_ids) {
          await applyLocalOp(await generateOp({ entity_kind: 'expense_share', entity_id: id, op_type: 'update', payload: { settled_at: null, settled_account_id: null }, user_id: user.id }))
        }
      })
      pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
      return
    }
    if (editId) {
      if (final.kind === 'money' && splitAllocations && splitAllocations.length > 0) {
        await splitExistingEntry(final, editId, splitAllocations)
      } else {
        await updateEntry(final, editId)
      }
      return
    }

    if (final.kind === 'task') {
      const taskId = crypto.randomUUID()
      const op = await generateOp({
        entity_kind: 'task',
        entity_id: taskId,
        op_type: 'create',
        payload: {
          title: final.title,
          due_at: final.due_at ?? null,
          priority: final.priority,
          completed_at: null,
          source: final.source,
          raw_input: final.raw_input ?? null,
          recur_period: recurring.enabled ? recurring.period : null,
          recur_interval: recurring.enabled ? recurring.intervalCount : null,
          tags: final.tags ?? [],
          project_id: final.project_id ?? null,
        },
        user_id: user.id,
      })
      await applyLocalOp(op)
      if (activeTab !== 'tasks') setTab('tasks')
      setDraft(null)
      setEditId(null)
      announceSaved(savedLabel({ kind: 'task', title: final.title }), taskId, () => deleteCreated('task', [taskId]))
      if (final.due_at && pushStatus === 'unsubscribed') {
        try {
          const shown = await db.sync_meta.get('push-nudge-shown')
          if (!shown) setShowPushNudge(true)
        } catch (err) {
          console.warn('nudge check failed:', err)
        }
      }
      pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
      return
    }

    if (final.kind === 'learning') {
      const learningId = crypto.randomUUID()
      const op = await generateOp({
        entity_kind: 'learning',
        entity_id: learningId,
        op_type: 'create',
        payload: {
          text: final.text,
          tags: final.tags,
          attribution: final.attribution ?? null,
          occurred_at: final.occurred_at,
          source: final.source,
        },
        user_id: user.id,
      })
      await applyLocalOp(op)
      if (activeTab !== 'learning') setTab('learning')
      setDraft(null)
      setEditId(null)
      announceSaved(savedLabel({ kind: 'learning' }), learningId, () => deleteCreated('learning', [learningId]))
      pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
      return
    }

    if (final.kind === 'note') {
      const noteId = crypto.randomUUID()
      const op = await generateOp({
        entity_kind: 'note',
        entity_id: noteId,
        op_type: 'create',
        payload: {
          body: final.body,
          title: final.title ?? null,
          tags: final.tags,
          occurred_at: final.occurred_at,
          source: final.source,
        },
        user_id: user.id,
      })
      await applyLocalOp(op)
      if (activeTab !== 'notes') setTab('notes')
      setDraft(null)
      setEditId(null)
      announceSaved(savedLabel({ kind: 'note', title: final.title ?? null, body: final.body }), noteId, () => deleteCreated('note', [noteId]))
      pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
      return
    }

    if (final.kind === 'budget') {
      const existing = await db.budgets.get(final.category_id)
      const op = await generateOp({
        entity_kind: 'budget',
        entity_id: final.category_id,
        op_type: existing ? 'update' : 'create',
        payload: { category_id: final.category_id, amount: final.amount, currency: final.currency },
        user_id: user.id,
      })
      await applyLocalOp(op)
      setDraft(null)
      setEditId(null)
      announceSaved(savedLabel({ kind: 'budget', categoryName: final.category_name, amount: final.amount, currency: final.currency }), null, existing
        ? async () => { await applyLocalOp(await generateOp({ entity_kind: 'budget', entity_id: final.category_id, op_type: 'update', payload: { category_id: existing.category_id, amount: existing.amount, currency: existing.currency }, user_id: user.id })) }
        : () => deleteCreated('budget', [final.category_id]))
      pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
      return
    }

    // Split: one payment across N categories → N money entries sharing a
    // split_group_id. Each part is an ordinary entry, so every aggregation
    // (budgets/analytics/account balance/net worth) treats it as-is — no
    // special-casing anywhere. Recurring is not combined with split (v1).
    if (splitAllocations && splitAllocations.length > 0) {
      const groupId = crypto.randomUUID()
      const partIds: string[] = []
      for (const alloc of splitAllocations) {
        const partId = crypto.randomUUID()
        partIds.push(partId)
        const partOp = await generateOp({
          entity_kind: 'money',
          entity_id: partId,
          op_type: 'create',
          payload: {
            amount: alloc.amount, currency: final.currency, direction: final.direction,
            category_id: alloc.category_id ?? null,
            description: final.description ?? null,
            merchant: final.merchant ?? null,
            tags: final.tags ?? [],
            occurred_at: final.occurred_at,
            source: final.source,
            raw_input: final.raw_input ?? null,
            recurring_rule_id: null,
            receipt_key: final.receipt_key ?? null,
            account_id: final.account_id ?? null,
            split_group_id: groupId,
          },
          user_id: user.id,
        })
        await applyLocalOp(partOp)
      }
      if (final.draftId) await deleteReceiptDraft(final.draftId)
      if (activeTab !== 'money') setTab('money')
      setDraft(null)
      setEditId(null)
      announceSaved(
        savedLabel({ kind: 'money', amount: final.amount, currency: final.currency, direction: final.direction, parts: splitAllocations.length }),
        groupId,
        () => deleteCreated('money', partIds),
      )
      pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
      return
    }

    // Money kind (Phase 1 logic, preserved verbatim)
    let ruleId: string | null = null
    if (recurring.enabled) {
      ruleId = crypto.randomUUID()
      const ruleOp = await generateOp({
        entity_kind: 'recurring',
        entity_id: ruleId,
        op_type: 'create',
        payload: {
          amount: final.amount, currency: final.currency, direction: final.direction,
          category_id: final.category_id ?? null,
          description: final.description ?? null,
          period: recurring.period,
          interval_count: recurring.intervalCount,
          anchor_at: final.occurred_at,
          next_due_at: nextDueFromAnchor(final.occurred_at, recurring.period, recurring.intervalCount),
          end_condition_kind: 'never',
          is_active: 1,
        },
        user_id: user.id,
      })
      await applyLocalOp(ruleOp)
    }

    const entryId = crypto.randomUUID()
    const entryOp = await generateOp({
      entity_kind: 'money',
      entity_id: entryId,
      op_type: 'create',
      payload: {
        amount: final.amount, currency: final.currency, direction: final.direction,
        category_id: final.category_id ?? null,
        description: final.description ?? null,
        merchant: final.merchant ?? null,
        tags: final.tags ?? [],
        occurred_at: final.occurred_at,
        source: final.source,
        raw_input: final.raw_input ?? null,
        recurring_rule_id: ruleId,
        receipt_key: final.receipt_key ?? null,
        account_id: final.account_id ?? null,
      },
      user_id: user.id,
    })
    await applyLocalOp(entryOp)
    const shared = final.direction === 'out' ? (final.shared_with ?? []) : []
    if (shared.length) await applyShareChanges(entryId, shared)
    if (final.draftId) await deleteReceiptDraft(final.draftId)
    if (activeTab !== 'money') setTab('money')
    setDraft(null)
    setEditId(null)
    // Undo deletes the entry (its shares stop counting once the entry is gone) and any rule it started.
    announceSaved(
      savedLabel({
        kind: 'money', amount: final.amount, currency: final.currency, direction: final.direction,
        categoryName: final.category_id ? categoryById.get(final.category_id)?.name ?? null : null,
        yourShare: shared.length ? Math.max(0, final.amount - shared.reduce((n, r) => n + (r.amount ?? 0), 0)) : null,
      }),
      entryId,
      async () => {
        await deleteCreated('money', [entryId])
        if (ruleId) await deleteCreated('recurring', [ruleId])
      },
    )
    pushPullOnce({ userId: user.id }).catch(err => console.error('sync', err))
  }

  if (!user) return <p className="p-8">Loading…</p>

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto grid w-full max-w-6xl gap-6 p-6 pb-[calc(6rem_+_env(safe-area-inset-bottom))] md:gap-8 md:p-8 lg:pb-8 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-6 md:gap-7">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PulseLogo className="size-6" />
              <h1 className="text-2xl font-semibold">Lifeloom</h1>
            </div>
            <div className="flex flex-wrap items-center gap-1 md:gap-3">
              <button
                type="button"
                aria-label="Search"
                onClick={() => setSearchOpen(true)}
                className="rounded-xl p-2 text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
              >
                <Search className="h-5 w-5" />
              </button>
              <Link href="/dashboard" className="rounded-xl p-2 text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-accent-2 outline-none" aria-label="Dashboard">
                <LayoutDashboard className="h-5 w-5" />
              </Link>
              <Link href="/habits" className="rounded-xl p-2 text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-accent-2 outline-none" aria-label="Habits">
                <CheckCircle2 className="h-5 w-5" />
              </Link>
              <Link href="/journal" className="rounded-xl p-2 text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-accent-2 outline-none" aria-label="Journal">
                <BookOpen className="h-5 w-5" />
              </Link>
              <Link href="/assistant" className="rounded-xl p-2 text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-accent-2 outline-none" aria-label="Assistant">
                <Sparkles className="h-5 w-5" />
              </Link>
              <Link href="/settings" className="rounded-xl p-2 text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-accent-2 outline-none" aria-label="Settings">
                <Settings className="h-5 w-5" />
              </Link>
              <Button size="sm" variant="outline"
                onClick={() => authClient.signOut().then(() => router.replace('/login'))}>
                Sign out
              </Button>
            </div>
          </header>
          <p className="text-xs text-muted-foreground">Signed in as {user.email}</p>

          {/* Shared input header — voice + text — dispatches to either tab */}
          <div className="glass rounded-2xl flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="flex items-center gap-2">
              <VoiceRecorder
                disabled={draft !== null || parsing || queryPlan !== null}
                onParsed={(payload, transcript, intent) => {
                  if (intent === 'chat') {
                    setShowHelp(true)
                  } else if (!payload) {
                    setText(transcript)
                    setCaptureNotice('unplaced')
                  } else if (isQueryPlan(payload)) {
                    setQueryPlan(payload)
                    setQuerySource('voice')
                  } else {
                    setDraft(payload as ChipDraft)
                  }
                }}
              />
              <ReceiptButton
                disabled={draft !== null || parsing || queryPlan !== null}
                onParsed={(payload, previewUrl) => {
                  setDraft({ ...(payload as unknown as ChipDraft), receiptPreviewUrl: previewUrl } as ChipDraft)
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label="Add an entry manually"
                disabled={draft !== null || parsing || queryPlan !== null}
                onClick={() => {
                  const tabKind = activeTab === 'tasks' ? 'task' : activeTab === 'notes' ? 'note' : activeTab === 'learning' ? 'learning' : 'money'
                  setDraft(blankDraftForKind(tabKind, prefs.primary_currency ?? 'INR', new Date().toISOString()))
                }}
              >
                + Add
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label="What can I do?"
                disabled={draft !== null || parsing || queryPlan !== null}
                onClick={() => setShowHelp(true)}
              >
                ?
              </Button>
            </div>
            {!online && (
              <div role="status" className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded whitespace-nowrap">
                ● Offline — captures log manually / queue
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); parseText() }} className="flex flex-1 gap-2 ml-2">
              <Input
                value={text}
                onChange={e => { setText(e.target.value); if (captureNotice) setCaptureNotice(null) }}
                placeholder='spent 80 on chai — or — remind me to call mom'
                disabled={parsing || draft !== null || queryPlan !== null}
                className="bg-transparent placeholder:text-muted-foreground border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Button type="submit" disabled={parsing || draft !== null || queryPlan !== null || !text.trim()}>
                {parsing ? 'Parsing…' : online ? 'Parse' : 'Add'}
              </Button>
            </form>
          </div>

          {captureNotice && !draft && (
            <div role="alert" className="glass-soft flex flex-col gap-2 rounded-2xl p-3 text-sm sm:flex-row sm:items-center">
              <p className="flex-1">
                {captureNotice === 'unplaced' ? 'I couldn’t tell what that is.' : 'Couldn’t reach the AI just now.'}{' '}
                <span className="text-muted-foreground">Try “spent 80 on chai”, “remind me to call mom at 6” or “note: the wifi password is on the router”.</span>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={addManually}>Add it manually</Button>
                <Button variant="ghost" aria-label="Dismiss" onClick={() => setCaptureNotice(null)}><X className="size-4" aria-hidden /></Button>
              </div>
            </div>
          )}

          {queuedCount > 0 && (
            <div aria-live="polite" className="text-xs text-muted-foreground px-3 py-2">
              {queuedCount} capture{queuedCount === 1 ? '' : 's'} pending
            </div>
          )}

          {draft && (
            <ConfirmationChip
              userId={user.id}
              draft={draft}
              categoryById={categoryById}
              onConfirm={confirmEntry}
              mode={editId ? 'edit' : 'create'}
              onCancel={() => {
                if (draft?.kind === 'money' && draft.draftId) deleteReceiptDraft(draft.draftId).catch(console.error)
                setDraft(null)
                setEditId(null)
              }}
            />
          )}

          {queryPlan && queryPlan.kind === 'query_money' && (
            <QueryAnswerCard
              userId={user.id}
              plan={queryPlan}
              onResult={handleAnswerResult}
              onDismiss={dismissQuery}
            />
          )}

          {queryPlan && queryPlan.kind === 'query_task' && (
            <QueryTaskListAnswer
              userId={user.id}
              plan={queryPlan}
              onResult={handleAnswerResult}
              onDismiss={dismissQuery}
            />
          )}

          {queryPlan && queryPlan.kind === 'query_learning' && (
            <QueryLearningListAnswer
              userId={user.id}
              plan={queryPlan}
              onResult={handleAnswerResult}
              onDismiss={dismissQuery}
            />
          )}

          {queryPlan && queryPlan.kind === 'query_notes' && (
            <QueryNotesListAnswer
              userId={user.id}
              plan={queryPlan}
              onResult={handleAnswerResult}
              onDismiss={dismissQuery}
            />
          )}

          {showHelp && !draft && !queryPlan && (
            <HelpCard
              onPick={(p) => {
                setShowHelp(false)
                setText(p)
              }}
              onDismiss={() => setShowHelp(false)}
            />
          )}

          <TodayNudge userId={user.id} onGoToTasks={() => setTab('tasks')} />

          {/* Desktop tab bar — appears in document flow above the tab content */}
          <div className="hidden lg:block">
            <TabBar variant="inline" active={activeTab} onChange={setTab} taskBadgeCount={taskBadgeCount} />
          </div>

          {showPushNudge && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
              <span className="text-blue-900">Get notified when tasks are due</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setShowPushNudge(false)
                    await db.sync_meta.put({ key: 'push-nudge-shown', value: '1' })
                    await pushSubscribe().catch((err) => console.error('subscribe', err))
                  }}
                  className="font-semibold text-blue-600 hover:underline"
                >
                  Enable
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowPushNudge(false)
                    await db.sync_meta.put({ key: 'push-nudge-shown', value: '1' })
                  }}
                  className="text-blue-600 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Conditional tab content */}
          {activeTab === 'money' && (
            <div className="flex flex-col gap-3">
              <DigestCard userId={user.id} />
              <BudgetSection userId={user.id} />
              <CardsSection userId={user.id} />
              <Link href="/analytics" className="inline-flex items-center justify-center min-h-[44px] px-3 py-2 text-xs font-medium uppercase tracking-wide rounded bg-white/5 hover:bg-white/10 transition-colors">📈 Trends</Link>
              <div className="md:hidden">
                <MoneyCard userId={user.id} onSelectCategory={(name) => setMoneyFilter(f => ({ ...f, categoryName: name }))} />
              </div>
              <MoneyControls userId={user.id} filter={moneyFilter} sort={moneySort} onFilter={setMoneyFilter} onSort={setMoneySort} />
              <MoneyList userId={user.id} onEdit={editMoney} categorizeId={categorizeId} filter={moneyFilter} sort={moneySort} />
            </div>
          )}
          {activeTab === 'tasks' && (
            <div className="flex flex-col gap-3">
              <TaskFilter active={taskFilter} onChange={setTaskFilter} />
              <ProjectPicker userId={user.id} selectedId={taskProjectId} onSelect={setTaskProjectId} noneLabel="All projects" />
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <TaskTagFilter userId={user.id} selectedTag={taskTag} onChange={setTaskTag} />
                <SortControl
                  options={[
                    { value: 'due', label: 'Due date' },
                    { value: 'created-desc', label: 'Created (newest)' },
                    { value: 'created-asc', label: 'Created (oldest)' },
                    { value: 'priority', label: 'Priority' },
                  ]}
                  value={taskSort}
                  onChange={setTaskSort}
                  label="Sort:"
                />
              </div>
              <TaskList userId={user.id} filter={taskFilter} projectId={taskProjectId} tag={taskTag} sort={taskSort} onEdit={editTask} />
            </div>
          )}
          {activeTab === 'learning' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <LearningTagFilter userId={user.id} selectedTag={selectedLearningTag} onChange={setSelectedLearningTag} />
                <SortControl
                  options={[
                    { value: 'newest', label: 'Newest' },
                    { value: 'oldest', label: 'Oldest' },
                  ]}
                  value={learningSort}
                  onChange={setLearningSort}
                  label="Sort:"
                />
              </div>
              <LearningList userId={user.id} selectedTag={selectedLearningTag} sort={learningSort} onEdit={editLearning} />
            </div>
          )}
          {activeTab === 'notes' && (
            <div className="flex flex-col gap-3">
              <Input
                aria-label="Search notes"
                value={notesSearchInputValue}
                onChange={e => setNotesSearchInputValue(e.target.value)}
                placeholder="Search notes…"
                className="min-h-[44px] bg-white/5 border border-white/10 placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 focus-visible:ring-offset-0"
              />
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <NotesTagFilter userId={user.id} selectedTag={selectedNotesTag} onChange={setSelectedNotesTag} />
                <SortControl
                  options={[
                    { value: 'newest', label: 'Newest' },
                    { value: 'oldest', label: 'Oldest' },
                  ]}
                  value={notesSort}
                  onChange={setNotesSort}
                  label="Sort:"
                />
              </div>
              <NotesList
                userId={user.id}
                selectedTag={selectedNotesTag}
                searchQuery={notesSearchQuery}
                sort={notesSort}
                onEdit={editNote}
              />
            </div>
          )}
        </div>

        {/* Desktop-only sticky sidebar (right column) */}
        <aside className="hidden min-w-0 lg:block">
          <div className="sticky top-6 flex flex-col gap-4">
            {activeTab === 'money' && <MoneyCard userId={user.id} onSelectCategory={(name) => setMoneyFilter(f => ({ ...f, categoryName: name }))} />}
            {activeTab === 'tasks' && <TaskSummary userId={user.id} />}
            {activeTab === 'learning' && <LearningSummary userId={user.id} />}
            {activeTab === 'notes' && <NotesSummary userId={user.id} />}
          </div>
        </aside>
      </main>

      {/* Mobile + tablet fixed bottom tab bar (desktop uses the in-flow bar) */}
      <div className="lg:hidden">
        <TabBar variant="dock" active={activeTab} onChange={setTab} taskBadgeCount={taskBadgeCount} />
      </div>

      {searchOpen && (
        <GlobalSearch
          userId={user.id}
          onClose={() => setSearchOpen(false)}
          onSelect={(kind, id) => { setSearchOpen(false); setTab(kind); setFocusId(id) }}
        />
      )}
    </>
  )
}

// AppPageInner reads the URL via useTabState → useSearchParams, which makes it a
// CSR-bailout component. `next build` requires such a component to sit under a
// Suspense boundary during static prerender of /app — without this wrapper the
// route fails to build and the Cloudflare deploy fails. (Missed until now
// because the gate ran typecheck/lint/test but never `next build`.)
type SettleSharePayload = { kind: 'settle_share'; person_id: string | null; person_name: string; amount: number; currency: string }
function isSettleSharePayload(p: unknown): p is SettleSharePayload {
  return typeof p === 'object' && p !== null && (p as { kind?: unknown }).kind === 'settle_share'
}

export default function AppPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <LockGate>
        <UndoProvider>
          <AppPageInner />
        </UndoProvider>
      </LockGate>
    </Suspense>
  )
}
