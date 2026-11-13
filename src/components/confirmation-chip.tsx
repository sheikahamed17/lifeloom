'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { ArrowDownLeft, ArrowUpRight, BookOpen, CalendarDays, CheckSquare, ChevronDown, NotebookPen, Plus, Split, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CategoryPicker } from '@/components/category-picker'
import { PeriodPicker, type Period } from '@/components/period-picker'
import { ProjectPicker } from '@/components/project-picker'
import { addTag } from '@/lib/task-org'
import { cn } from '@/lib/utils'
import { currencySymbol } from '@/lib/currency'
import { formatDay, formatLocalDateTime } from '@/lib/format'
import { parseAmountInput } from '@/lib/parse-amount'
import { type Allocation, isSplitValid, splitRemaining } from '@/lib/split-transaction'
import { pickDefaultAccountId, resolveDraftAccountId } from '@/lib/default-account'
import { equalShares, isSharesValid } from '@/lib/shares'
import type { ShareDraftRow } from '@/lib/share-edit'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useAccounts } from '@/hooks/use-accounts'
import { usePeople } from '@/hooks/use-people'
import { useCategories } from '@/hooks/use-categories'
import type { MoneyPayload } from '@/lib/op-schemas/money'
import type { TaskPayload } from '@/lib/op-schemas/task'
import type { LearningPayload } from '@/lib/op-schemas/learning'
import type { NotePayload } from '@/lib/op-schemas/note'
import type { CategoryRow } from '@/lib/dexie'

// One vocabulary for every chip: editable values are pills, extra actions are cyan pills.
const FIELD_PILL = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-sm outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent-2'
const ACTION_PILL = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-accent-2/40 px-3 text-sm text-accent-2 outline-none transition-colors hover:bg-accent-2/10 focus-visible:ring-2 focus-visible:ring-accent-2'
const CHIP_LINK = 'inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2'

export type ChipDraft =
  | (MoneyPayload & { kind: 'money'; draftCategoryName?: string; receiptPreviewUrl?: string; draftId?: string; merchant?: string | null; tags?: string[]; account_id?: string | null; shared_with?: ShareDraftRow[] })
  | (TaskPayload & { kind: 'task' })
  | (LearningPayload & { kind: 'learning' })
  | (NotePayload & { kind: 'note' })
  | { kind: 'budget'; category_id: string; category_name: string; amount: number; currency: string }
  | { kind: 'settle'; person_id: string; person_name: string; share_ids: string[]; amount: number; currency: string; summary: string; account_id?: string | null }

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
  if (draft.kind === 'settle') {
    return <ConfirmationChipSettle userId={userId} draft={draft} onConfirm={onConfirm} onCancel={onCancel} />
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
  draft: MoneyPayload & { kind: 'money'; draftCategoryName?: string; receiptPreviewUrl?: string; merchant?: string | null; tags?: string[]; account_id?: string | null; shared_with?: ShareDraftRow[] }
  categoryById: Map<string, CategoryRow>
  onConfirm: Props['onConfirm']
  onCancel: () => void
  mode: 'create' | 'edit'
}) {
  const [d, setD] = useState<MoneyPayload & { kind: 'money'; draftCategoryName?: string; receiptPreviewUrl?: string; merchant?: string | null; tags?: string[]; account_id?: string | null; shared_with?: ShareDraftRow[] }>(draft)
  const accounts = useAccounts(userId)
  const splitCats = useCategories(userId, d.direction === 'out' ? 'spend' : 'income')
  const [editingField, setEditingField] = useState<null | 'amount' | 'description' | 'category' | 'date' | 'merchant'>(draft.amount === 0 ? 'amount' : null)
  const [newTag, setNewTag] = useState('')
  const [makeRecurring, setMakeRecurring] = useState(false)
  const [period, setPeriod] = useState<Period>('monthly')
  const [intervalCount, setIntervalCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [splitMode, setSplitMode] = useState(false)
  const [splitRows, setSplitRows] = useState<{ key: number; category_id: string | null; amountText: string }[]>([])
  const splitKey = useRef(0)
  // "Shared with": people who owe part of this entry. Rows mirror split rows;
  // null amounts from a voice capture are resolved to an equal split here.
  const people = usePeople(userId)
  const shareKey = useRef(1_000_000)   // initial rows are keyed 0..n-1; new rows never collide
  const [shareRows, setShareRows] = useState<ShareRow[]>(() => initialShareRows(draft.amount, draft.shared_with ?? []))
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

  // What "More details" holds, said in one line so nothing in it is a surprise.
  const today = new Date().toISOString().slice(0, 10) === d.occurred_at.slice(0, 10)
  const moreSummary = [
    d.merchant,
    today ? 'Today' : formatDay(d.occurred_at),
    (d.tags?.length ?? 0) > 0 ? `${d.tags!.length} tag${d.tags!.length === 1 ? '' : 's'}` : null,
    makeRecurring ? 'Repeats' : null,
  ].filter(Boolean).join(' · ')

  const allocations: Allocation[] = splitRows.map(r => ({ category_id: r.category_id, amount: parseAmountInput(r.amountText) ?? 0 }))
  const remaining = splitRemaining(d.amount, allocations)
  const splitReady = isSplitValid(d.amount, allocations)

  const sharesActive = d.direction === 'out' && !splitMode && shareRows.length > 0
  const shareAmounts = shareRows.map(r => parseAmountInput(r.amountText) ?? 0)
  const sharesTotalMinor = shareAmounts.reduce((n, a) => n + a, 0)
  const yourShareMinor = Math.max(0, d.amount - sharesTotalMinor)
  const sharesReady = shareRows.every(r => r.settled || (r.name.trim().length > 0 && (parseAmountInput(r.amountText) ?? 0) > 0)) && isSharesValid(d.amount, shareAmounts)

  const [focusShareKey, setFocusShareKey] = useState<number | null>(null)
  function addShareRow() {
    setEditingField(null)
    const key = shareKey.current++
    setFocusShareKey(key)
    setShareRows(prev => equalizeShareRows(d.amount, [...prev, { key, personId: null as string | null, name: '', amountText: '', settled: false }]))
  }

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
      const shared_with: ShareDraftRow[] = sharesActive
        ? shareRows.map(r => ({ share_id: r.shareId, person_id: r.personId, name: r.name.trim(), amount: parseAmountInput(r.amountText) ?? 0, settled: r.settled }))
        : []
      const final = { ...d, account_id: accountId, shared_with }
      if (splitMode) await onConfirm(final, { enabled: false, period, intervalCount }, allocations)
      else await onConfirm(final, { enabled: makeRecurring, period, intervalCount })
    } finally { setBusy(false) }
  }

  return (
    <div className="glass rounded-2xl p-4 sm:p-5" role="group" aria-label={isEdit ? 'Edit entry' : 'New entry'}>
      <div className="mb-2 flex items-center justify-between">
        <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', d.direction === 'out' ? 'text-destructive' : 'text-income')}>
          {d.direction === 'out' ? <ArrowUpRight className="size-4" aria-hidden /> : <ArrowDownLeft className="size-4" aria-hidden />}
          {d.direction === 'out' ? 'Spend' : 'Income'}
        </span>
        <button
          type="button"
          className={CHIP_LINK}
          onClick={() => setD(s => ({ ...s, direction: s.direction === 'out' ? 'in' : 'out' }))}
        >
          {d.direction === 'out' ? 'It’s income' : 'It’s a spend'}
        </button>
      </div>

      {d.receiptPreviewUrl && (
        <div className="relative mb-3 h-40 w-full overflow-hidden rounded-lg">
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
          aria-label={`Amount ${symbol}${major}, edit`}
          className="mb-3 block rounded-lg font-mono text-3xl font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent-2"
        >
          {symbol}{major}
        </button>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {!splitMode && (
          <>
            <button
              type="button"
              onClick={() => setEditingField(editingField === 'category' ? null : 'category')}
              aria-expanded={editingField === 'category'}
              className={cn(FIELD_PILL, !cat && 'text-muted-foreground')}
            >
              {cat ? <>{cat.icon && <span aria-hidden="true">{cat.icon}</span>}{cat.name}</> : 'Pick a category'}
            </button>
            {shareRows.length === 0 && (
              <button type="button" onClick={enterSplit} className={ACTION_PILL}>
                <Split className="size-3.5" aria-hidden /> Split
              </button>
            )}
            {d.direction === 'out' && shareRows.length === 0 && (
              <button type="button" onClick={addShareRow} className={ACTION_PILL}>
                <Users className="size-3.5" aria-hidden /> Share with…
              </button>
            )}
          </>
        )}
        {editingField === 'description' ? (
          <Input
            autoFocus
            defaultValue={d.description ?? ''}
            aria-label="Description"
            placeholder="What was it for?"
            onBlur={(e) => {
              const v = e.currentTarget.value
              setD(s => ({ ...s, description: v || null }))
              setEditingField(null)
            }}
            className="h-9 max-w-60"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingField('description')}
            className={cn(FIELD_PILL, !d.description && 'text-muted-foreground')}
          >
            {d.description || <><Plus className="size-3.5" aria-hidden />Description</>}
          </button>
        )}
        <select
          value={accountId ?? ''}
          onChange={(e) => { const v = e.target.value; setAccountTouched(true); setD(s => ({ ...s, account_id: v || null })) }}
          className={cn(FIELD_PILL, 'pr-1')}
          aria-label="Account"
        >
          <option value="">No account</option>
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>
              {acc.name}
            </option>
          ))}
        </select>
      </div>

      {editingField === 'category' && (
        <div className="glass-soft mb-3 rounded-2xl p-2">
          <CategoryPicker
            userId={userId}
            kind={d.direction === 'out' ? 'spend' : 'income'}
            selectedId={d.category_id ?? null}
            onSelect={(id) => { setD(s => ({ ...s, category_id: id })); setEditingField(null) }}
          />
        </div>
      )}

      {splitMode && (
        <div className="glass-soft mb-3 flex flex-col gap-2 rounded-2xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Split across categories</span>
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
                className="flex-1 min-w-0 rounded-lg border bg-muted px-2 py-1 text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
              >
                <option value="">Uncategorized</option>
                {splitCats.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
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
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSplitRows(prev => [...prev, { key: splitKey.current++, category_id: null, amountText: '' }])}
            className={cn(CHIP_LINK, 'self-start text-accent-2')}
          >
            <Plus className="size-3.5" aria-hidden /> Add category
          </button>
          <div className={cn('text-xs font-mono tabular-nums', remaining === 0 ? 'text-muted-foreground' : 'text-destructive')}>
            Remaining: {symbol}{(remaining / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
      )}

      {sharesActive && (
        <div className="glass-soft mb-3 flex flex-col gap-2 rounded-2xl p-3" role="group" aria-label="Shared with">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Shared with</span>
            {!shareRows.some(r => r.settled) && (
              <button
                type="button"
                onClick={() => setShareRows([])}
                className="relative text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded before:absolute before:-inset-x-1 before:-inset-y-3"
              >
                Not shared
              </button>
            )}
          </div>
          {shareRows.map((row, i) => row.settled ? (
            <div key={row.key} className="flex items-center justify-between gap-1.5 text-xs text-muted-foreground">
              <span>{row.name}</span>
              <span className="font-mono tabular-nums">{symbol}{((parseAmountInput(row.amountText) ?? 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} · paid</span>
            </div>
          ) : (
            <div key={row.key} className="flex items-center gap-1.5">
              {row.shareId ? (
                <span className="min-w-0 flex-1 truncate text-xs" title={row.name}>{row.name}</span>
              ) : (
              <select
                value={row.personId ?? '__new__'}
                onChange={e => {
                  const v = e.target.value
                  const person = people.find(p => p.id === v)
                  setShareRows(prev => prev.map((r, j) => (j === i ? { ...r, personId: person ? person.id : null, name: person ? person.name : '' } : r)))
                }}
                aria-label={`Person ${i + 1}`}
                className="min-w-0 flex-1 rounded-lg border bg-muted px-2 py-1 text-base md:text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
              >
                <option value="__new__">New person…</option>
                {people.filter(p => p.id === row.personId || !shareRows.some(r => r.personId === p.id)).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              )}
              {!row.shareId && row.personId === null && (
                <Input
                  value={row.name}
                  maxLength={60}
                  autoFocus={row.key === focusShareKey}
                  onChange={e => { const v = e.currentTarget.value; setShareRows(prev => prev.map((r, j) => (j === i ? { ...r, name: v } : r))) }}
                  placeholder="Name"
                  aria-label={`Name of person ${i + 1}`}
                  className="h-7 w-24 text-base md:text-xs"
                />
              )}
              <Input
                inputMode="decimal"
                value={row.amountText}
                onChange={e => { const v = e.currentTarget.value; setShareRows(prev => prev.map((r, j) => (j === i ? { ...r, amountText: v } : r))) }}
                placeholder="0"
                aria-label={`Amount owed by person ${i + 1}`}
                className="h-7 w-20 text-base md:text-xs"
              />
              <button
                type="button"
                onClick={() => setShareRows(prev => prev.filter((_, j) => j !== i))}
                aria-label={`Remove person ${i + 1}`}
                className="relative text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded before:absolute before:-inset-2"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addShareRow}
            className={cn(CHIP_LINK, 'self-start text-accent-2')}
          >
            <Plus className="size-3.5" aria-hidden /> Add person
          </button>
          <div className={cn('text-xs font-mono tabular-nums', sharesTotalMinor <= d.amount ? 'text-muted-foreground' : 'text-destructive')} aria-live="polite">
            {sharesTotalMinor <= d.amount
              ? `Your share: ${symbol}${(yourShareMinor / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              : `Shares exceed the amount by ${symbol}${((sharesTotalMinor - d.amount) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          </div>
        </div>
      )}

      <button
        type="button"
        aria-expanded={moreOpen}
        aria-controls="chip-more"
        onClick={() => setMoreOpen(o => !o)}
        className="mb-3 flex min-h-11 w-full items-center gap-2 rounded-lg border-t border-white/10 pt-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-2"
      >
        <span className="font-medium">More details</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{moreSummary}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', moreOpen && 'rotate-180')} aria-hidden />
      </button>

      {moreOpen && (
        <div id="chip-more" className="mb-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
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
                className="h-9 max-w-60"
                placeholder="Merchant or payee"
              />
            ) : (
              <button type="button" onClick={() => setEditingField('merchant')} className={cn(FIELD_PILL, !d.merchant && 'text-muted-foreground')}>
                {d.merchant || <><Plus className="size-3.5" aria-hidden />Merchant</>}
              </button>
            )}
            {editingField === 'date' ? (
              <Input
                autoFocus
                type="date"
                aria-label="Date"
                defaultValue={d.occurred_at.slice(0, 10)}
                onBlur={(e) => {
                  const v = e.currentTarget.value
                  if (v) setD(s => ({ ...s, occurred_at: new Date(v + 'T12:00:00').toISOString() }))
                  setEditingField(null)
                }}
                className="h-9 w-auto"
              />
            ) : (
              <button type="button" onClick={() => setEditingField('date')} className={FIELD_PILL} aria-label={`Date ${formatDay(d.occurred_at)}, edit`}>
                <CalendarDays className="size-3.5" aria-hidden />{formatDay(d.occurred_at)}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tags">
            {(d.tags ?? []).map(tag => (
              <span key={tag} className={cn(FIELD_PILL, 'pr-0')}>
                {tag}
                <button type="button" onClick={() => setD(s => ({ ...s, tags: (s.tags ?? []).filter(t => t !== tag) }))}
                  aria-label={`Remove tag “${tag}”`} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2">
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            ))}
            <Input value={newTag} onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const trimmed = newTag.trim(); if (trimmed && !(d.tags ?? []).includes(trimmed) && (d.tags ?? []).length < 20) { setD(s => ({ ...s, tags: [...(s.tags ?? []), trimmed] })); setNewTag('') } } }}
              placeholder="Add a tag…" aria-label="Add a tag, then press Enter" className="h-9 w-32" />
          </div>

          {!isEdit && !splitMode && !sharesActive && (
            <div className="flex flex-col gap-2">
              <label className="glass-soft flex min-h-11 items-center justify-between rounded-lg px-3 text-sm">
                <span>Repeat this entry</span>
                <input type="checkbox" className="size-4 accent-[var(--accent-2)]" checked={makeRecurring} onChange={e => setMakeRecurring(e.currentTarget.checked)} />
              </label>
              {makeRecurring && (
                <PeriodPicker period={period} intervalCount={intervalCount} onChange={(p, n) => { setPeriod(p); setIntervalCount(n) }} />
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="glow-cta flex-[2]" onClick={handleConfirm} disabled={busy || d.amount === 0 || (splitMode && !splitReady) || (sharesActive && !sharesReady)}>
          {splitMode ? `${isEdit ? 'Save' : 'Confirm'} split (${splitRows.length})`
            : isEdit ? 'Save changes'
            : sharesActive ? `Confirm ${symbol}${major} · you ${symbol}${(yourShareMinor / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            : `Confirm ${symbol}${major}`}
        </Button>
      </div>

    </div>
  )
}

type ShareRow = { key: number; shareId?: string; personId: string | null; name: string; amountText: string; settled: boolean }

/** Rows from a draft: null amounts (voice "split with Arun") get an equal share of the entry. */
function initialShareRows(amount: number, rows: ShareDraftRow[]): ShareRow[] {
  const open = rows.filter(r => r.amount === null).length
  const fixed = rows.reduce((n, r) => n + (r.amount ?? 0), 0)
  const each = open > 0 ? Math.max(0, Math.floor((amount - fixed) / (open + 1))) : 0
  return rows.map((r, i) => ({
    key: i, shareId: r.share_id, personId: r.person_id, name: r.name,
    amountText: toAmountText(r.amount ?? each), settled: !!r.settled,
  }))
}

/** Re-split the entry equally among you and the unsettled rows (settled rows keep their amount). */
function equalizeShareRows(amount: number, rows: ShareRow[]): ShareRow[] {
  const settled = rows.filter(r => r.settled).reduce((n, r) => n + (parseAmountInput(r.amountText) ?? 0), 0)
  const open = rows.filter(r => !r.settled).length
  const [each] = equalShares(Math.max(0, amount - settled), open)
  return rows.map(r => (r.settled ? r : { ...r, amountText: toAmountText(each ?? 0) }))
}

function toAmountText(minor: number): string {
  return minor > 0 ? String(minor / 100) : ''
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
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
          <CheckSquare className="size-4" aria-hidden /> Task
        </span>
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
            className={FIELD_PILL}
          >
            {d.due_at ? <><CalendarDays className="size-3.5" aria-hidden />{dueDisplay}</> : <><Plus className="size-3.5" aria-hidden />Due date</>}
          </button>
        )}

        <select
          value={d.priority}
          aria-label="Priority"
          onChange={e => { const v = e.target.value as 'low' | 'medium' | 'high'; setD(s => ({ ...s, priority: v })) }}
          className={cn(FIELD_PILL, 'pr-1')}
        >
          <option value="low">Low priority</option>
          <option value="medium">Medium priority</option>
          <option value="high">High priority</option>
        </select>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5 items-start" role="group" aria-label="Tags">
        {(d.tags ?? []).map(tag => (
          <div key={tag} className={cn(FIELD_PILL, 'pr-0')}>
            <span>{tag}</span>
            <button type="button" onClick={() => setD(s => ({ ...s, tags: (s.tags ?? []).filter(t => t !== tag) }))}
              aria-label={`Remove tag "${tag}"`} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2">
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
        <Input value={newTag} onChange={e => setNewTag(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setD(s => ({ ...s, tags: addTag(s.tags ?? [], newTag) })); setNewTag('') } }}
          placeholder="Add a tag…" aria-label="Add task tag" className="h-9 w-32" />
      </div>
      <div className="mb-3">
        <ProjectPicker userId={userId} selectedId={d.project_id ?? null} onSelect={id => setD(s => ({ ...s, project_id: id }))} />
      </div>

      {!isEdit && (
        <div className="mb-3 flex flex-col gap-2">
          <label className="glass-soft flex min-h-11 items-center justify-between rounded-lg px-3 text-sm">
            <span>Repeat after it’s done</span>
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
        <Button className="glow-cta flex-[2]" onClick={handleConfirm} disabled={busy || !d.title.trim()}>
          {isEdit ? 'Save changes' : 'Confirm task'}
        </Button>
      </div>

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
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-2">
          <BookOpen className="size-4" aria-hidden /> Learning
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
          className="mb-3 w-full rounded-lg border bg-background p-2 font-mono text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none resize-none"
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
          <div key={tag} className={cn(FIELD_PILL, 'pr-0')}>
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove tag "${tag}"`}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2"
            >
              <X className="size-3.5" aria-hidden />
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
              placeholder="Add a tag…"
              aria-label="Add new tag"
              className="h-9 w-32"
            />
            <button
              type="button"
              onClick={() => addTag(newTag)}
              aria-label="Add tag"
              className="flex size-9 items-center justify-center rounded-lg border border-white/15 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent-2"
            >
              <Plus className="size-4" aria-hidden />
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
          className="mb-3 block w-full min-h-11 flex items-center text-left rounded-lg border bg-muted px-2 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
        >
          {d.attribution || '+ source / attribution'}
        </button>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="glow-cta flex-[2]" onClick={handleConfirm} disabled={busy || !d.text.trim()}>
          {isEdit ? 'Save changes' : 'Confirm learning'}
        </Button>
      </div>

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
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-warning">
          <NotebookPen className="size-4" aria-hidden /> Note
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
          className="mb-3 w-full rounded-lg border bg-background p-2 font-mono text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none resize-none"
          rows={3}
          aria-label="Note body"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingBody(true)}
          className="mb-3 block w-full min-h-11 whitespace-pre-wrap text-left font-mono text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded flex items-center"
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
          className="mb-3 block w-full min-h-11 flex items-center text-left rounded-lg border bg-muted px-2 text-sm focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
          aria-label="Edit note title"
        >
          {d.title ? <span className="font-semibold">{d.title}</span> : <span className="text-muted-foreground">+ title (optional)</span>}
        </button>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5 items-start" role="group" aria-label="Tags">
        {d.tags.map((tag) => (
          <div key={tag} className={cn(FIELD_PILL, 'pr-0')}>
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove tag "${tag}"`}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2"
            >
              <X className="size-3.5" aria-hidden />
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
              placeholder="Add a tag…"
              aria-label="Add new tag"
              className="h-9 w-32"
            />
            <button
              type="button"
              onClick={() => addTag(newTag)}
              aria-label="Add tag"
              className="flex size-9 items-center justify-center rounded-lg border border-white/15 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent-2"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="glow-cta flex-[2]" onClick={handleConfirm} disabled={busy || !d.body.trim()}>
          {isEdit ? 'Save changes' : 'Confirm note'}
        </Button>
      </div>

    </div>
  )
}

/** "Arun paid me ₹10,000": settle the matched shares into an account. Not a money entry — never income. */
function ConfirmationChipSettle({ userId, draft, onConfirm, onCancel }: {
  userId: string
  draft: Extract<ChipDraft, { kind: 'settle' }>
  onConfirm: Props['onConfirm']
  onCancel: () => void
}) {
  const accounts = useAccounts(userId)
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)
  const [accountId, setAccountId] = useState<string | null>(null)
  const receiveInto = touched ? accountId : pickDefaultAccountId(accounts)
  const major = draft.amount / (draft.currency === 'JPY' ? 1 : 100)

  async function handleConfirm() {
    setBusy(true)
    try { await onConfirm({ ...draft, account_id: receiveInto }, { enabled: false, period: 'monthly', intervalCount: 1 }) }
    finally { setBusy(false) }
  }

  return (
    <div className="glass rounded-2xl p-4 flex flex-col gap-3">
      <div className="inline-flex items-center gap-1.5 text-sm font-medium text-income"><Users className="size-4" aria-hidden /> Paid back</div>
      <p className="text-sm">
        <span className="font-medium">{draft.person_name}</span> paid{' '}
        <span className="font-mono tabular-nums">{currencySymbol(draft.currency)}{major.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        {' '}for {draft.summary} ({draft.share_ids.length} {draft.share_ids.length === 1 ? 'share' : 'shares'}).
      </p>
      <label className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Paid into</span>
        <select
          value={receiveInto ?? ''}
          onChange={e => { setTouched(true); setAccountId(e.target.value || null) }}
          className="rounded-lg border bg-muted px-2 py-1 text-base md:text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
          aria-label="Account the repayment landed in"
        >
          <option value="">No account</option>
          {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">This clears the debt and tops up the account. It isn’t counted as income.</p>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="glow-cta flex-[2]" onClick={handleConfirm} disabled={busy}>
          Mark paid
        </Button>
      </div>
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
        <button type="button" aria-label="Confirm budget" className="min-h-11 px-3 text-xs rounded-lg bg-accent-2/20 text-accent-2 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none" onClick={handleConfirm} disabled={busy}>Set</button>
        <button type="button" aria-label="Cancel" className="min-h-11 px-3 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded-lg" onClick={onCancel} disabled={busy}>Cancel</button>
      </span>
    </div>
  )
}
