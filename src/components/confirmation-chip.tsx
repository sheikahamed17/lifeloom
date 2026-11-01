'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CategoryPicker } from '@/components/category-picker'
import { PeriodPicker, type Period } from '@/components/period-picker'
import { ProjectPicker } from '@/components/project-picker'
import { addTag } from '@/lib/task-org'
import { cn } from '@/lib/utils'
import { currencySymbol } from '@/lib/currency'
import { formatLocalDateTime } from '@/lib/format'
import { parseAmountInput } from '@/lib/parse-amount'
import { type Allocation, isSplitValid, splitRemaining } from '@/lib/split-transaction'
import { pickDefaultAccountId, resolveDraftAccountId } from '@/lib/default-account'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useAccounts } from '@/hooks/use-accounts'
import { useCategories } from '@/hooks/use-categories'
import type { MoneyPayload } from '@/lib/op-schemas/money'
import type { TaskPayload } from '@/lib/op-schemas/task'
import type { LearningPayload } from '@/lib/op-schemas/learning'
import type { NotePayload } from '@/lib/op-schemas/note'
import type { CategoryRow } from '@/lib/dexie'

export type ChipDraft =
  | (MoneyPayload & { kind: 'money'; draftCategoryName?: string; receiptPreviewUrl?: string; draftId?: string; merchant?: string | null; tags?: string[]; account_id?: string | null })
  | (TaskPayload & { kind: 'task' })
  | (LearningPayload & { kind: 'learning' })
  | (NotePayload & { kind: 'note' })
  | { kind: 'budget'; category_id: string; category_name: string; amount: number; currency: string }

type Props = {
  userId: string
  draft: ChipDraft
  categoryById: Map<string, CategoryRow>
  onConfirm: (final: ChipDraft, recurring: { enabled: boolean; period: Period; intervalCount: number }, splitAllocations?: Allocation[]) => Promise<void>
  onCancel: () => void
  mode?: 'create' | 'edit'
}

export function ConfirmationChip({ userId, draft, categoryById, onConfirm, onCancel, mode = 'create' }: Props) {
  if (draft.kind === 'task') {
    return <ConfirmationChipTask userId={userId} draft={draft} onConfirm={onConfirm} onCancel={onCancel} mode={mode} />
  }
  if (draft.kind === 'learning') {
    return <ConfirmationChipLearning draft={draft} onConfirm={onConfirm} onCancel={onCancel} mode={mode} />
  }
  if (draft.kind === 'note') {
    return <ConfirmationChipNote draft={draft} onConfirm={onConfirm} onCancel={onCancel} mode={mode} />
  }
  if (draft.kind === 'budget') {
    return <ConfirmationChipBudget draft={draft} onConfirm={onConfirm} onCancel={onCancel} />
  }
  return <ConfirmationChipMoney userId={userId} draft={draft} categoryById={categoryById} onConfirm={onConfirm} onCancel={onCancel} mode={mode} />
}

function ConfirmationChipMoney({
  userId,
  draft,
  categoryById,
  onConfirm,
  onCancel,
  mode,
}: {
  userId: string
  draft: MoneyPayload & { kind: 'money'; draftCategoryName?: string; receiptPreviewUrl?: string; merchant?: string | null; tags?: string[]; account_id?: string | null }
  categoryById: Map<string, CategoryRow>
  onConfirm: Props['onConfirm']
  onCancel: () => void
  mode: 'create' | 'edit'
}) {
  const [d, setD] = useState<MoneyPayload & { kind: 'money'; draftCategoryName?: string; receiptPreviewUrl?: string; merchant?: string | null; tags?: string[]; account_id?: string | null }>(draft)
  const accounts = useAccounts(userId)
  const splitCats = useCategories(userId, d.direction === 'out' ? 'spend' : 'income')
  const [editingField, setEditingField] = useState<null | 'amount' | 'description' | 'category' | 'date' | 'merchant'>(draft.amount === 0 ? 'amount' : null)
  const [newTag, setNewTag] = useState('')
  const [makeRecurring, setMakeRecurring] = useState(false)
  const [period, setPeriod] = useState<Period>('monthly')
  const [intervalCount, setIntervalCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [splitMode, setSplitMode] = useState(false)
  const [splitRows, setSplitRows] = useState<{ key: number; category_id: string | null; amountText: string }[]>([])
  const splitKey = useRef(0)
  const isEdit = mode === 'edit'
  // A new entry with no account starts on the ★ default (Settings → Accounts);
  // any pick in the dropdown — including "No account" — overrides it.
  const [accountTouched, setAccountTouched] = useState(false)
  const accountId = resolveDraftAccountId({
    draftAccountId: d.account_id, touched: accountTouched, isEdit, defaultId: pickDefaultAccountId(accounts),
  })

  const major = (d.amount / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
  const symbol = currencySymbol(d.currency)
  const cat = d.category_id ? categoryById.get(d.category_id) : undefined

  const allocations: Allocation[] = splitRows.map(r => ({ category_id: r.category_id, amount: parseAmountInput(r.amountText) ?? 0 }))
  const remaining = splitRemaining(d.amount, allocations)
  const splitReady = isSplitValid(d.amount, allocations)

  function enterSplit() {
    setSplitRows([
      { key: splitKey.current++, category_id: d.category_id ?? null, amountText: d.amount ? String(d.amount / 100) : '' },
      { key: splitKey.current++, category_id: null, amountText: '' },
    ])
    setEditingField(null)
    setSplitMode(true)
  }

  async function handleConfirm() {
    setBusy(true)
    try {
      const final = { ...d, account_id: accountId }
      if (splitMode) await onConfirm(final, { enabled: false, period, intervalCount }, allocations)
      else await onConfirm(final, { enabled: makeRecurring, period, intervalCount })
    } finally { setBusy(false) }
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className={cn(
          'font-semibold uppercase tracking-wide',
          d.direction === 'out' ? 'text-rose-500' : 'text-emerald-500',
        )}>
          {d.direction === 'out' ? '💸 Spend' : '💰 Income'}
        </span>
        <button
          type="button"
          className="text-muted-foreground hover:underline focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
          onClick={() => setD(s => ({ ...s, direction: s.direction === 'out' ? 'in' : 'out' }))}
        >
          flip
        </button>
      </div>

      {d.receiptPreviewUrl && (
        <div className="relative mb-3 h-40 w-full overflow-hidden rounded-md">
          <Image
            src={d.receiptPreviewUrl}
            alt="receipt"
            fill
            unoptimized
            className="object-contain"
          />
        </div>
      )}

      {editingField === 'amount' ? (
        <Input
          autoFocus
          inputMode="decimal"
          defaultValue={d.amount === 0 ? '' : major}
          placeholder="0"
          onChange={(e) => { const amt = parseAmountInput(e.currentTarget.value) ?? 0; setD(s => ({ ...s, amount: amt })) }}
          onBlur={() => setEditingField(null)}
          className="mb-3 font-mono text-3xl font-semibold"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingField('amount')}
          className="mb-3 block font-mono text-3xl font-semibold tabular-nums focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
        >
          {symbol}{major}
        </button>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {!splitMode && (
          <>
            <button
              type="button"
              onClick={() => setEditingField('category')}
              className="rounded-md border bg-muted px-2 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
            >
              {cat ? `${cat.icon ?? ''} ${cat.name}` : 'Pick category…'}
            </button>
            {!isEdit && (
              <button
                type="button"
                onClick={enterSplit}
                className="rounded-md border border-accent-2/40 text-accent-2 px-2 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
              >
                ⑂ Split
              </button>
            )}
          </>
        )}
        {editingField === 'description' ? (
          <Input
            autoFocus
            defaultValue={d.description ?? ''}
            onBlur={(e) => {
              const v = e.currentTarget.value
              setD(s => ({ ...s, description: v || null }))
              setEditingField(null)
            }}
            className="h-7 max-w-[200px] text-xs"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingField('description')}
            className="rounded-md border bg-muted px-2 py-0.5 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
          >
            {d.description || '+ description'}
          </button>
        )}
      </div>

      {splitMode && (
        <div className="mb-3 flex flex-col gap-2 rounded-md border bg-background p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Split across categories</span>
            <button
              type="button"
              onClick={() => setSplitMode(false)}
              className="text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
            >
              Cancel split
            </button>
          </div>
          {splitRows.map((row, i) => (
            <div key={row.key} className="flex items-center gap-1.5">
              <select
                value={row.category_id ?? ''}
                onChange={e => { const v = e.target.value || null; setSplitRows(prev => prev.map((r, j) => (j === i ? { ...r, category_id: v } : r))) }}
                aria-label={`Category for split part ${i + 1}`}
                className="flex-1 min-w-0 rounded-md border bg-muted px-2 py-1 text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
              >
                <option value="">Uncategorized</option>
                {splitCats.map(c => (
                  <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>
                ))}
              </select>
              <Input
                inputMode="decimal"
                value={row.amountText}
                onChange={e => { const v = e.currentTarget.value; setSplitRows(prev => prev.map((r, j) => (j === i ? { ...r, amountText: v } : r))) }}
                placeholder="0"
                aria-label={`Amount for split part ${i + 1}`}
                className="h-7 w-20 text-xs"
              />
              {splitRows.length > 2 && (
                <button
                  type="button"
                  onClick={() => setSplitRows(prev => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove split part ${i + 1}`}
                  className="text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSplitRows(prev => [...prev, { key: splitKey.current++, category_id: null, amountText: '' }])}
            className="self-start text-xs text-accent-2 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
          >
            ＋ Add category
          </button>
          <div className={cn('text-xs font-mono tabular-nums', remaining === 0 ? 'text-muted-foreground' : 'text-destructive')}>
            Remaining: {symbol}{(remaining / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {editingField === 'merchant' ? (
          <Input
            autoFocus
            maxLength={120}
            aria-label="Merchant or payee"
            defaultValue={d.merchant ?? ''}
            onBlur={(e) => {
              const v = e.currentTarget.value
              setD(s => ({ ...s, merchant: v || null }))
              setEditingField(null)
            }}
            className="h-7 max-w-[200px] text-xs"
            placeholder="Merchant / payee"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingField('merchant')}
            className="rounded-md border bg-muted px-2 py-0.5 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
          >
            {d.merchant || '+ merchant'}
          </button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5 items-start" role="group" aria-label="Tags">
        {(d.tags ?? []).map(tag => (
          <div key={tag} className="flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs">
            <span>{tag}</span>
            <button type="button" onClick={() => setD(s => ({ ...s, tags: (s.tags ?? []).filter(t => t !== tag) }))}
              aria-label={`Remove tag "${tag}"`} className="ml-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <Input value={newTag} onChange={e => setNewTag(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const trimmed = newTag.trim(); if (trimmed && !(d.tags ?? []).includes(trimmed) && (d.tags ?? []).length < 20) { setD(s => ({ ...s, tags: [...(s.tags ?? []), trimmed] })); setNewTag('') } } }}
          placeholder="add tag…" aria-label="Add money tag" className="h-7 text-xs max-w-[100px]" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <select
          value={accountId ?? ''}
          onChange={(e) => { const v = e.target.value; setAccountTouched(true); setD(s => ({ ...s, account_id: v || null })) }}
          className="rounded-md border bg-muted px-2 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
          aria-label="Account"
        >
          <option value="">No account</option>
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>
              {acc.icon ? `${acc.icon} ${acc.name}` : acc.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {editingField === 'date' ? (
          <Input
            autoFocus
            type="date"
            defaultValue={d.occurred_at.slice(0, 10)}
            onBlur={(e) => {
              const v = e.currentTarget.value
              if (v) setD(s => ({ ...s, occurred_at: new Date(v + 'T12:00:00').toISOString() }))
              setEditingField(null)
            }}
            className="h-7 text-xs"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingField('date')}
            className="rounded-md border bg-muted px-2 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
          >
            📅 {d.occurred_at.slice(0, 10)}
          </button>
        )}
      </div>

      {editingField === 'category' && (
        <div className="mb-3 rounded-md border bg-background p-2">
          <CategoryPicker
            userId={userId}
            kind={d.direction === 'out' ? 'spend' : 'income'}
            selectedId={d.category_id ?? null}
            onSelect={(id) => { setD(s => ({ ...s, category_id: id })); setEditingField(null) }}
          />
        </div>
      )}

      {!isEdit && !splitMode && (
        <div className="mb-3 flex flex-col gap-2">
          <label className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
            <span>Make recurring</span>
            <input
              type="checkbox"
              checked={makeRecurring}
              onChange={e => setMakeRecurring(e.currentTarget.checked)}
            />
          </label>
          {makeRecurring && (
            <PeriodPicker
              period={period}
              intervalCount={intervalCount}
              onChange={(p, n) => { setPeriod(p); setIntervalCount(n) }}
            />
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="flex-[2] bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] hover:opacity-90" onClick={handleConfirm} disabled={busy || d.amount === 0 || (splitMode && !splitReady)}>
          {isEdit ? 'Save changes' : splitMode ? `Confirm split (${splitRows.length})` : `Confirm ${symbol}${major}`}
        </Button>
      </div>

      <p className="mt-1 text-center text-[10px] text-muted-foreground">tap any field to edit</p>
    </div>
  )
}

function ConfirmationChipTask({
  userId,
  draft,
  onConfirm,
  onCancel,
  mode,
}: {
  userId: string
  draft: TaskPayload & { kind: 'task' }
  onConfirm: Props['onConfirm']
  onCancel: () => void
  mode: 'create' | 'edit'
}) {
  const [d, setD] = useState<TaskPayload & { kind: 'task' }>(draft)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingDue, setEditingDue] = useState(false)
  const [busy, setBusy] = useState(false)
  const [makeRecurring, setMakeRecurring] = useState(false)
  const [period, setPeriod] = useState<Period>('daily')
  const [intervalCount, setIntervalCount] = useState(1)
  const [newTag, setNewTag] = useState('')
  const { prefs } = useUserPrefs()
  const isEdit = mode === 'edit'

  async function handleConfirm() {
    setBusy(true)
    try { await onConfirm(d, { enabled: makeRecurring, period, intervalCount }) }
    finally { setBusy(false) }
  }

  const dueDisplay = d.due_at
    ? formatLocalDateTime(d.due_at, prefs.tz)
    : 'no due date'

  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-violet-500">
          ✅ Task
        </span>
        <span className="text-muted-foreground">priority: {d.priority}</span>
      </div>

      {editingTitle ? (
        <Input
          autoFocus
          defaultValue={d.title}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim()
            if (v) setD(s => ({ ...s, title: v }))
            setEditingTitle(false)
          }}
          className="mb-3 font-mono text-2xl font-semibold"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingTitle(true)}
          className="mb-3 block font-mono text-2xl font-semibold text-left focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
        >
          {d.title}
        </button>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {editingDue ? (
          <Input
            autoFocus
            type="datetime-local"
            defaultValue={d.due_at ? d.due_at.slice(0, 16) : ''}
            onBlur={(e) => {
              const v = e.currentTarget.value
              setD(s => ({ ...s, due_at: v ? new Date(v).toISOString() : null }))
              setEditingDue(false)
            }}
            className="h-7 text-xs"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingDue(true)}
            className="rounded-md border bg-muted px-2 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
          >
            {d.due_at ? `📅 ${dueDisplay}` : '+ due date'}
          </button>
        )}

        <select
          value={d.priority}
          onChange={e => { const v = e.target.value as 'low' | 'medium' | 'high'; setD(s => ({ ...s, priority: v })) }}
          className="rounded-md border bg-muted px-2 py-0.5 text-xs"
        >
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5 items-start" role="group" aria-label="Tags">
        {(d.tags ?? []).map(tag => (
          <div key={tag} className="flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs">
            <span>{tag}</span>
            <button type="button" onClick={() => setD(s => ({ ...s, tags: (s.tags ?? []).filter(t => t !== tag) }))}
              aria-label={`Remove tag "${tag}"`} className="ml-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <Input value={newTag} onChange={e => setNewTag(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setD(s => ({ ...s, tags: addTag(s.tags ?? [], newTag) })); setNewTag('') } }}
          placeholder="add tag…" aria-label="Add task tag" className="h-7 text-xs max-w-[100px]" />
      </div>
      <div className="mb-3">
        <ProjectPicker userId={userId} selectedId={d.project_id ?? null} onSelect={id => setD(s => ({ ...s, project_id: id }))} />
      </div>

      {!isEdit && (
        <div className="mb-3 flex flex-col gap-2">
          <label className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
            <span>Repeat after completion</span>
            <input
              type="checkbox"
              checked={makeRecurring}
              onChange={e => setMakeRecurring(e.currentTarget.checked)}
            />
          </label>
          {makeRecurring && (
            <PeriodPicker
              period={period}
              intervalCount={intervalCount}
              onChange={(p, n) => { setPeriod(p); setIntervalCount(n) }}
            />
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="flex-[2] bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] hover:opacity-90" onClick={handleConfirm} disabled={busy || !d.title.trim()}>
          {isEdit ? 'Save changes' : 'Confirm task'}
        </Button>
      </div>

      <p className="mt-1 text-center text-[10px] text-muted-foreground">tap any field to edit</p>
    </div>
  )
}

function ConfirmationChipLearning({
  draft,
  onConfirm,
  onCancel,
  mode,
}: {
  draft: LearningPayload & { kind: 'learning' }
  onConfirm: Props['onConfirm']
  onCancel: () => void
  mode: 'create' | 'edit'
}) {
  const [d, setD] = useState<LearningPayload & { kind: 'learning' }>(draft)
  const [editingText, setEditingText] = useState(false)
  const [editingAttribution, setEditingAttribution] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [busy, setBusy] = useState(false)
  const isEdit = mode === 'edit'

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm(d, { enabled: false, period: 'monthly', intervalCount: 1 })
    }
    finally { setBusy(false) }
  }

  function addTag(tag: string) {
    const trimmed = tag.trim()
    if (trimmed && !d.tags.includes(trimmed) && d.tags.length < 12) {
      setD(s => ({ ...s, tags: [...s.tags, trimmed] }))
      setNewTag('')
    }
  }

  function removeTag(tag: string) {
    setD(s => ({ ...s, tags: s.tags.filter(t => t !== tag) }))
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-cyan-500">
          📚 Learn
        </span>
      </div>

      {editingText ? (
        <textarea
          autoFocus
          defaultValue={d.text}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim()
            if (v) setD(s => ({ ...s, text: v }))
            setEditingText(false)
          }}
          className="mb-3 w-full rounded-md border bg-background p-2 font-mono text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none resize-none"
          rows={3}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingText(true)}
          className="mb-3 block w-full whitespace-pre-wrap text-left font-mono text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
        >
          {d.text}
        </button>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5 items-start" role="group" aria-label="Tags">
        {d.tags.map((tag) => (
          <div key={tag} className="flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs">
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove tag "${tag}"`}
              className="ml-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {d.tags.length < 12 && (
          <div className="flex items-center gap-1">
            <Input
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag(newTag)
                }
              }}
              placeholder="add tag…"
              aria-label="Add new tag"
              className="h-7 text-xs max-w-[100px]"
            />
            <button
              type="button"
              onClick={() => addTag(newTag)}
              aria-label="Add tag"
              className="min-h-[44px] flex items-center justify-center px-2 rounded-md border bg-muted hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none text-xs"
            >
              +
            </button>
          </div>
        )}
      </div>

      {editingAttribution ? (
        <Input
          autoFocus
          defaultValue={d.attribution ?? ''}
          onBlur={(e) => {
            const v = e.currentTarget.value
            setD(s => ({ ...s, attribution: v || null }))
            setEditingAttribution(false)
          }}
          placeholder="source / where learned…"
          aria-label="Where you learned it"
          className="mb-3 h-7 text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingAttribution(true)}
          aria-label="Edit source or attribution"
          className="mb-3 block w-full min-h-[44px] flex items-center text-left rounded-md border bg-muted px-2 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
        >
          {d.attribution || '+ source / attribution'}
        </button>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="flex-[2] bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] hover:opacity-90" onClick={handleConfirm} disabled={busy || !d.text.trim()}>
          {isEdit ? 'Save changes' : 'Confirm learning'}
        </Button>
      </div>

      <p className="mt-1 text-center text-[10px] text-muted-foreground">tap any field to edit</p>
    </div>
  )
}

function ConfirmationChipNote({
  draft,
  onConfirm,
  onCancel,
  mode,
}: {
  draft: NotePayload & { kind: 'note' }
  onConfirm: Props['onConfirm']
  onCancel: () => void
  mode: 'create' | 'edit'
}) {
  const [d, setD] = useState<NotePayload & { kind: 'note' }>(draft)
  const [editingBody, setEditingBody] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [busy, setBusy] = useState(false)
  const isEdit = mode === 'edit'

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm(d, { enabled: false, period: 'monthly', intervalCount: 1 })
    }
    finally { setBusy(false) }
  }

  function addTag(tag: string) {
    const trimmed = tag.trim()
    if (trimmed && !d.tags.includes(trimmed) && d.tags.length < 12) {
      setD(s => ({ ...s, tags: [...s.tags, trimmed] }))
      setNewTag('')
    }
  }

  function removeTag(tag: string) {
    setD(s => ({ ...s, tags: s.tags.filter(t => t !== tag) }))
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-amber-500">
          📝 Note
        </span>
      </div>

      {editingBody ? (
        <textarea
          autoFocus
          defaultValue={d.body}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim()
            if (v) setD(s => ({ ...s, body: v }))
            setEditingBody(false)
          }}
          className="mb-3 w-full rounded-md border bg-background p-2 font-mono text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none resize-none"
          rows={3}
          aria-label="Note body"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingBody(true)}
          className="mb-3 block w-full min-h-[44px] whitespace-pre-wrap text-left font-mono text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded flex items-center"
          aria-label="Edit note body"
        >
          {d.body}
        </button>
      )}

      {editingTitle ? (
        <Input
          autoFocus
          defaultValue={d.title ?? ''}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim()
            setD(s => ({ ...s, title: v || null }))
            setEditingTitle(false)
          }}
          placeholder="title (optional)…"
          aria-label="Note title"
          className="mb-3 font-mono text-sm"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingTitle(true)}
          className="mb-3 block w-full min-h-[44px] flex items-center text-left rounded-md border bg-muted px-2 text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
          aria-label="Edit note title"
        >
          {d.title ? <span className="font-semibold">{d.title}</span> : <span className="text-muted-foreground">+ title (optional)</span>}
        </button>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5 items-start" role="group" aria-label="Tags">
        {d.tags.map((tag) => (
          <div key={tag} className="flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs">
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove tag "${tag}"`}
              className="ml-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {d.tags.length < 12 && (
          <div className="flex items-center gap-1">
            <Input
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag(newTag)
                }
              }}
              placeholder="add tag…"
              aria-label="Add new tag"
              className="h-7 text-xs max-w-[100px]"
            />
            <button
              type="button"
              onClick={() => addTag(newTag)}
              aria-label="Add tag"
              className="min-h-[44px] flex items-center justify-center px-2 rounded-md border bg-muted hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none text-xs"
            >
              +
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="flex-[2] bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] hover:opacity-90" onClick={handleConfirm} disabled={busy || !d.body.trim()}>
          {isEdit ? 'Save changes' : 'Confirm note'}
        </Button>
      </div>

      <p className="mt-1 text-center text-[10px] text-muted-foreground">tap any field to edit</p>
    </div>
  )
}

function ConfirmationChipBudget({ draft, onConfirm, onCancel }: {
  draft: Extract<ChipDraft, { kind: 'budget' }>
  onConfirm: Props['onConfirm']
  onCancel: () => void
}) {
  const [busy, setBusy] = useState(false)
  const major = draft.amount / (draft.currency === 'JPY' ? 1 : 100)

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm(draft, { enabled: false, period: 'monthly', intervalCount: 1 })
    }
    finally { setBusy(false) }
  }

  return (
    <div className="glass-soft rounded-2xl p-3 flex items-center justify-between gap-3">
      <span className="text-sm">
        Budget · <span className="font-medium">{draft.category_name}</span> ·{' '}
        <span className="font-mono tabular-nums">{currencySymbol(draft.currency)}{major.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>/mo
      </span>
      <span className="flex items-center gap-2">
        <button type="button" aria-label="Confirm budget" className="min-h-[44px] px-3 text-xs rounded-lg bg-accent-2/20 text-accent-2 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none" onClick={handleConfirm} disabled={busy}>Set</button>
        <button type="button" aria-label="Cancel" className="min-h-[44px] px-3 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded-lg" onClick={onCancel} disabled={busy}>Cancel</button>
      </span>
    </div>
  )
}
