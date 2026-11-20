'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { CalendarDays, ChevronDown, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { CategoryPicker } from '@/components/money/category-picker'
import { PeriodPicker, type Period } from '@/components/shared/period-picker'
import { ProjectPicker } from '@/components/tasks/project-picker'
import { addTag } from '@/lib/task-org'
import { cn } from '@/lib/utils'
import { currencySymbol, formatMinor } from '@/lib/currency'
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

// One vocabulary for every chip. An editor is a form on the page ground: a ruled heading,
// white fields, one primary action. Editable values look like the white fields they open.
const FIELD_PILL = 'h-12 max-w-full rounded-[14px] border-transparent bg-card px-4 font-medium hover:bg-accent'
// Extra actions (split, share, add a row, flip direction) are underlined ink links.
const ACTION_PILL = 'h-12 border-transparent bg-transparent px-2 font-medium underline underline-offset-4 hover:bg-transparent'
const CHIP_LINK = 'h-11 px-2 font-medium underline underline-offset-4 hover:bg-transparent'
// A shadcn NativeSelect sized to its content (the wrapper takes the class; the white field is its own).
const SELECT_PILL = 'w-fit max-w-full'
const SELECT_ROW = 'min-w-0 flex-1'
// A tag chip: a label with a remove button.
const TAG_CHIP = 'h-11 gap-0 rounded-[14px] border-transparent bg-muted pr-0 pl-3.5 text-sm font-medium text-foreground'
// A click-to-edit text block (the display state of an inline field).
const EDIT_BLOCK = 'h-auto min-h-12 w-full justify-start whitespace-pre-wrap rounded-[14px] border-transparent bg-card px-4 py-3 text-left font-normal hover:bg-accent'
// The ruled heading every editor starts with.
const CHIP_HEAD = 'mb-4 flex min-h-11 items-end justify-between gap-2 border-b border-border pb-2.5'
const CHIP_TITLE = 'text-[19px] font-bold tracking-[-0.02em] lg:text-[22px]'
// A sub-section inside an editor (split parts, shared with): ruled, not boxed.
const CHIP_SUB = 'mb-3 flex flex-col gap-2 border-t border-border pt-3'
const SUB_TITLE = 'text-[15px] font-semibold'
const SUB_LINK = 'h-11 px-2 text-[13px] font-medium underline underline-offset-4 hover:bg-transparent'
// A switch row (repeat): a ruled row, label left, switch right.
const SWITCH_ROW = 'min-h-[52px] justify-between border-t border-border text-[15px] font-medium text-foreground'

export type ChipDraft =
  | (MoneyPayload & { kind: 'money'; draftCategoryName?: string; receiptPreviewUrl?: string; draftId?: string; merchant?: string | null; tags?: string[]; account_id?: string | null; shared_with?: ShareDraftRow[] })
  | (TaskPayload & { kind: 'task' })
  | (LearningPayload & { kind: 'learning' })
  | (NotePayload & { kind: 'note' })
  | { kind: 'budget'; category_id: string; category_name: string; amount: number; currency: string }
  // "Arun paid me 300": `owed` = what Arun owed in this currency before it (negative = you already held his money).
  | { kind: 'settle'; person_id: string; person_name: string; amount: number; currency: string; owed: number; account_id?: string | null }

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
  const firstShareAmountRef = useRef<HTMLInputElement>(null)
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
    <div role="group" aria-label={isEdit ? 'Edit entry' : 'New entry'}>
      <div className={cn(CHIP_HEAD, 'pb-0')}>
        <h2 className={cn(CHIP_TITLE, 'pb-2.5')}>{d.direction === 'out' ? 'Spend' : 'Income'}</h2>
        <Button
          variant="ghost"
          className={cn(CHIP_LINK, '-mr-2')}
          onClick={() => setD(s => ({ ...s, direction: s.direction === 'out' ? 'in' : 'out' }))}
        >
          {d.direction === 'out' ? 'It’s income' : 'It’s a spend'}
        </Button>
      </div>

      {d.receiptPreviewUrl && (
        <div className="relative mb-3 h-40 w-full overflow-hidden rounded-2xl bg-card">
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
          className="mb-3 h-16 text-3xl font-semibold tabular-nums md:text-3xl"
        />
      ) : (
        <Button
          variant="ghost"
          onClick={() => setEditingField('amount')}
          aria-label={`Amount ${symbol}${major}, edit`}
          className="-ml-2 mb-3 h-auto min-h-13 px-2 text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums"
        >
          {symbol}{major}
        </Button>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!splitMode && (
          <>
            <Button
              variant="outline"
              onClick={() => setEditingField(editingField === 'category' ? null : 'category')}
              aria-expanded={editingField === 'category'}
              className={cn(FIELD_PILL, !cat && 'text-muted-foreground')}
            >
              {cat ? cat.name : 'Pick a category'}
            </Button>
            {shareRows.length === 0 && (
              <Button variant="outline" onClick={enterSplit} className={ACTION_PILL}>
                Split
              </Button>
            )}
            {d.direction === 'out' && shareRows.length === 0 && (
              <Button variant="outline" onClick={addShareRow} className={ACTION_PILL}>
                Share with…
              </Button>
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
            className="max-w-60"
          />
        ) : (
          <Button
            variant="outline"
            onClick={() => setEditingField('description')}
            className={cn(FIELD_PILL, !d.description && 'text-muted-foreground')}
          >
            {d.description || <><Plus className="size-3.5" aria-hidden />Description</>}
          </Button>
        )}
        <NativeSelect
          value={accountId ?? ''}
          onChange={(e) => { const v = e.target.value; setAccountTouched(true); setD(s => ({ ...s, account_id: v || null })) }}
          className={SELECT_PILL}
          aria-label="Account"
        >
          <NativeSelectOption value="">No account</NativeSelectOption>
          {accounts.map(acc => (
            <NativeSelectOption key={acc.id} value={acc.id}>
              {acc.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {editingField === 'category' && (
        <div className="mb-3">
          <CategoryPicker
            userId={userId}
            kind={d.direction === 'out' ? 'spend' : 'income'}
            selectedId={d.category_id ?? null}
            onSelect={(id) => { setD(s => ({ ...s, category_id: id })); setEditingField(null) }}
          />
        </div>
      )}

      {splitMode && (
        <div className={CHIP_SUB}>
          <div className="flex items-center justify-between">
            <span className={SUB_TITLE}>Split across categories</span>
            <Button variant="ghost" size="sm" onClick={() => setSplitMode(false)} className={cn(SUB_LINK, '-mr-2')}>
              Cancel split
            </Button>
          </div>
          {splitRows.map((row, i) => (
            <div key={row.key} className="flex items-center gap-2">
              <NativeSelect
                value={row.category_id ?? ''}
                onChange={e => { const v = e.target.value || null; setSplitRows(prev => prev.map((r, j) => (j === i ? { ...r, category_id: v } : r))) }}
                aria-label={`Category for split part ${i + 1}`}
                className={SELECT_ROW}
              >
                <NativeSelectOption value="">Uncategorized</NativeSelectOption>
                {splitCats.map(c => (
                  <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>
                ))}
              </NativeSelect>
              <Input
                inputMode="decimal"
                value={row.amountText}
                onChange={e => { const v = e.currentTarget.value; setSplitRows(prev => prev.map((r, j) => (j === i ? { ...r, amountText: v } : r))) }}
                placeholder="0"
                aria-label={`Amount for split part ${i + 1}`}
                className="w-24 px-3 text-right"
              />
              {splitRows.length > 2 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSplitRows(prev => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove split part ${i + 1}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" aria-hidden />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="ghost"
            onClick={() => setSplitRows(prev => [...prev, { key: splitKey.current++, category_id: null, amountText: '' }])}
            className={cn(CHIP_LINK, '-ml-2 self-start')}
          >
            <Plus className="size-3.5" aria-hidden /> Add category
          </Button>
          <div className={cn('text-[13px] tabular-nums', remaining === 0 ? 'text-muted-foreground' : 'text-destructive')}>
            Remaining: {symbol}{(remaining / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
      )}

      {sharesActive && (
        <div className={CHIP_SUB} role="group" aria-label="Shared with">
          <div className="flex items-center justify-between">
            <span className={SUB_TITLE}>Shared with</span>
            {!shareRows.some(r => r.settled) && (
              <Button variant="ghost" size="sm" onClick={() => setShareRows([])} className={cn(SUB_LINK, '-mr-2')}>
                Not shared
              </Button>
            )}
          </div>
          {shareRows.map((row, i) => row.settled ? (
            <div key={row.key} className="flex min-h-11 items-center justify-between gap-2 text-[13px] text-muted-foreground">
              <span>{row.name}</span>
              <span className="tabular-nums">{symbol}{((parseAmountInput(row.amountText) ?? 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} · paid</span>
            </div>
          ) : (
            <div key={row.key} className="flex items-center gap-2">
              {row.shareId ? (
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium" title={row.name}>{row.name}</span>
              ) : (
              <NativeSelect
                value={row.personId ?? '__new__'}
                onChange={e => {
                  const v = e.target.value
                  const person = people.find(p => p.id === v)
                  setShareRows(prev => prev.map((r, j) => (j === i ? { ...r, personId: person ? person.id : null, name: person ? person.name : '' } : r)))
                }}
                aria-label={`Person ${i + 1}`}
                className={SELECT_ROW}
              >
                <NativeSelectOption value="__new__">New person…</NativeSelectOption>
                {people.filter(p => p.id === row.personId || !shareRows.some(r => r.personId === p.id)).map(p => (
                  <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>
                ))}
              </NativeSelect>
              )}
              {!row.shareId && row.personId === null && (
                <Input
                  value={row.name}
                  maxLength={60}
                  autoFocus={row.key === focusShareKey}
                  onChange={e => { const v = e.currentTarget.value; setShareRows(prev => prev.map((r, j) => (j === i ? { ...r, name: v } : r))) }}
                  placeholder="Name"
                  aria-label={`Name of person ${i + 1}`}
                  className="w-28 px-3"
                />
              )}
              <Input
                ref={i === 0 ? firstShareAmountRef : undefined}
                inputMode="decimal"
                value={row.amountText}
                onChange={e => { const v = e.currentTarget.value; setShareRows(prev => prev.map((r, j) => (j === i ? { ...r, amountText: v } : r))) }}
                placeholder="0"
                aria-label={`Amount owed by person ${i + 1}`}
                className="w-24 px-3 text-right"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShareRows(prev => prev.filter((_, j) => j !== i))}
                aria-label={`Remove person ${i + 1}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            onClick={addShareRow}
            className={cn(CHIP_LINK, '-ml-2 self-start')}
          >
            <Plus className="size-3.5" aria-hidden /> Add person
          </Button>
          <div className="flex flex-wrap items-center gap-x-3">
            <div className={cn('text-[13px] tabular-nums', sharesTotalMinor <= d.amount ? 'text-muted-foreground' : 'text-destructive')} aria-live="polite">
              {sharesTotalMinor <= d.amount
                ? `Your share: ${symbol}${(yourShareMinor / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                : `Shares exceed the amount by ${symbol}${((sharesTotalMinor - d.amount) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            </div>
            {/* Paid on someone's behalf: one tap gives the one person the whole amount. */}
            {shareRows.length === 1 && !shareRows[0].settled && yourShareMinor > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShareRows(prev => prev.map(r => ({ ...r, amountText: toAmountText(d.amount) })))
                  // The link hides once your share is 0: keep focus on the amount it just set.
                  requestAnimationFrame(() => firstShareAmountRef.current?.focus())
                }}
                className={cn(SUB_LINK, '-ml-2')}
              >
                {shareRows[0].name.trim() ? `${shareRows[0].name.trim()} pays it all` : 'They pay it all'}
              </Button>
            )}
          </div>
        </div>
      )}

      <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
      <CollapsibleTrigger
        render={<Button variant="ghost" className="mb-3 h-13 w-full justify-start gap-2 rounded-none border-x-0 border-b-0 border-t border-border px-0 text-left text-[15px] font-normal hover:bg-transparent aria-expanded:bg-transparent" />}
      >
        <span className="font-semibold">More details</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{moreSummary}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', moreOpen && 'rotate-180')} aria-hidden />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div id="chip-more" className="mb-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
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
                className="max-w-60"
                placeholder="Merchant or payee"
              />
            ) : (
              <Button variant="outline" onClick={() => setEditingField('merchant')} className={cn(FIELD_PILL, !d.merchant && 'text-muted-foreground')}>
                {d.merchant || <><Plus className="size-3.5" aria-hidden />Merchant</>}
              </Button>
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
                className="w-auto"
              />
            ) : (
              <Button variant="outline" onClick={() => setEditingField('date')} className={FIELD_PILL} aria-label={`Date ${formatDay(d.occurred_at)}, edit`}>
                <CalendarDays className="size-3.5" aria-hidden />{formatDay(d.occurred_at)}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tags">
            {(d.tags ?? []).map(tag => (
              <Badge key={tag} variant="outline" className={TAG_CHIP}>
                {tag}
                <Button variant="ghost" size="icon" onClick={() => setD(s => ({ ...s, tags: (s.tags ?? []).filter(t => t !== tag) }))}
                  aria-label={`Remove tag “${tag}”`} className="text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" aria-hidden />
                </Button>
              </Badge>
            ))}
            <Input value={newTag} onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const trimmed = newTag.trim(); if (trimmed && !(d.tags ?? []).includes(trimmed) && (d.tags ?? []).length < 20) { setD(s => ({ ...s, tags: [...(s.tags ?? []), trimmed] })); setNewTag('') } } }}
              placeholder="Add a tag…" aria-label="Add a tag, then press Enter" className="w-32" />
          </div>

          {!isEdit && !splitMode && !sharesActive && (
            <div className="flex flex-col gap-2">
              <Label className={SWITCH_ROW}>
                <span>Repeat this entry</span>
                <Switch checked={makeRecurring} onCheckedChange={setMakeRecurring} />
              </Label>
              {makeRecurring && (
                <PeriodPicker period={period} intervalCount={intervalCount} onChange={(p, n) => { setPeriod(p); setIntervalCount(n) }} />
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
      </Collapsible>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="flex-[2]" onClick={handleConfirm} disabled={busy || d.amount === 0 || (splitMode && !splitReady) || (sharesActive && !sharesReady)}>
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
    <div role="group" aria-label={isEdit ? 'Edit task' : 'New task'}>
      <div className={CHIP_HEAD}>
        <h2 className={CHIP_TITLE}>Task</h2>
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
          className="mb-3 h-14 text-2xl font-semibold md:text-2xl"
        />
      ) : (
        <Button
          variant="ghost"
          onClick={() => setEditingTitle(true)}
          className="-ml-2 mb-3 h-auto min-h-11 justify-start whitespace-normal px-2 text-left text-2xl font-semibold tracking-[-0.02em]"
        >
          {d.title}
        </Button>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
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
            className="w-auto"
          />
        ) : (
          <Button
            variant="outline"
            onClick={() => setEditingDue(true)}
            className={FIELD_PILL}
          >
            {d.due_at ? <><CalendarDays className="size-3.5" aria-hidden />{dueDisplay}</> : <><Plus className="size-3.5" aria-hidden />Due date</>}
          </Button>
        )}

        <NativeSelect
          value={d.priority}
          aria-label="Priority"
          onChange={e => { const v = e.target.value as 'low' | 'medium' | 'high'; setD(s => ({ ...s, priority: v })) }}
          className={SELECT_PILL}
        >
          <NativeSelectOption value="low">Low priority</NativeSelectOption>
          <NativeSelectOption value="medium">Medium priority</NativeSelectOption>
          <NativeSelectOption value="high">High priority</NativeSelectOption>
        </NativeSelect>
      </div>

      <div className="mb-3 flex flex-wrap items-start gap-2" role="group" aria-label="Tags">
        {(d.tags ?? []).map(tag => (
          <Badge key={tag} variant="outline" className={TAG_CHIP}>
            <span>{tag}</span>
            <Button variant="ghost" size="icon" onClick={() => setD(s => ({ ...s, tags: (s.tags ?? []).filter(t => t !== tag) }))}
              aria-label={`Remove tag "${tag}"`} className="text-muted-foreground hover:text-foreground">
              <X className="size-3.5" aria-hidden />
            </Button>
          </Badge>
        ))}
        <Input value={newTag} onChange={e => setNewTag(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setD(s => ({ ...s, tags: addTag(s.tags ?? [], newTag) })); setNewTag('') } }}
          placeholder="Add a tag…" aria-label="Add task tag" className="w-32" />
      </div>
      <div className="mb-3">
        <ProjectPicker userId={userId} selectedId={d.project_id ?? null} onSelect={id => setD(s => ({ ...s, project_id: id }))} />
      </div>

      {!isEdit && (
        <div className="mb-3 flex flex-col gap-2">
          <Label className={SWITCH_ROW}>
            <span>Repeat after it’s done</span>
            <Switch checked={makeRecurring} onCheckedChange={setMakeRecurring} />
          </Label>
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
        <Button className="flex-[2]" onClick={handleConfirm} disabled={busy || !d.title.trim()}>
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
    <div role="group" aria-label={isEdit ? 'Edit learning' : 'New learning'}>
      <div className={CHIP_HEAD}>
        <h2 className={CHIP_TITLE}>Learning</h2>
      </div>

      {editingText ? (
        <Textarea
          autoFocus
          defaultValue={d.text}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim()
            if (v) setD(s => ({ ...s, text: v }))
            setEditingText(false)
          }}
          className="mb-3 resize-none text-base md:text-[15px]"
          rows={3}
          aria-label="What you learned"
        />
      ) : (
        <Button
          variant="ghost"
          onClick={() => setEditingText(true)}
          className={cn(EDIT_BLOCK, 'mb-3 text-[15px]')}
        >
          {d.text}
        </Button>
      )}

      <div className="mb-3 flex flex-wrap items-start gap-2" role="group" aria-label="Tags">
        {d.tags.map((tag) => (
          <Badge key={tag} variant="outline" className={TAG_CHIP}>
            <span>{tag}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeTag(tag)}
              aria-label={`Remove tag "${tag}"`}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </Badge>
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
              className="w-32"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => addTag(newTag)}
              aria-label="Add tag"
            >
              <Plus className="size-4" aria-hidden />
            </Button>
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
          className="mb-3"
        />
      ) : (
        <Button
          variant="outline"
          onClick={() => setEditingAttribution(true)}
          aria-label="Edit source or attribution"
          className={cn(EDIT_BLOCK, 'mb-3 text-sm text-muted-foreground')}
        >
          {d.attribution || '+ source / attribution'}
        </Button>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="flex-[2]" onClick={handleConfirm} disabled={busy || !d.text.trim()}>
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
    <div role="group" aria-label={isEdit ? 'Edit note' : 'New note'}>
      <div className={CHIP_HEAD}>
        <h2 className={CHIP_TITLE}>Note</h2>
      </div>

      {editingBody ? (
        <Textarea
          autoFocus
          defaultValue={d.body}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim()
            if (v) setD(s => ({ ...s, body: v }))
            setEditingBody(false)
          }}
          className="mb-3 resize-none text-base md:text-[15px]"
          rows={3}
          aria-label="Note body"
        />
      ) : (
        <Button
          variant="ghost"
          onClick={() => setEditingBody(true)}
          className={cn(EDIT_BLOCK, 'mb-3 text-[15px]')}
          aria-label="Edit note body"
        >
          {d.body}
        </Button>
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
          className="mb-3"
        />
      ) : (
        <Button
          variant="outline"
          onClick={() => setEditingTitle(true)}
          className={cn(EDIT_BLOCK, 'mb-3')}
          aria-label="Edit note title"
        >
          {d.title ? <span className="font-semibold">{d.title}</span> : <span className="text-muted-foreground">+ title (optional)</span>}
        </Button>
      )}

      <div className="mb-3 flex flex-wrap items-start gap-2" role="group" aria-label="Tags">
        {d.tags.map((tag) => (
          <Badge key={tag} variant="outline" className={TAG_CHIP}>
            <span>{tag}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeTag(tag)}
              aria-label={`Remove tag "${tag}"`}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </Badge>
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
              className="w-32"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => addTag(newTag)}
              aria-label="Add tag"
            >
              <Plus className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="flex-[2]" onClick={handleConfirm} disabled={busy || !d.body.trim()}>
          {isEdit ? 'Save changes' : 'Confirm note'}
        </Button>
      </div>

    </div>
  )
}

/** "Arun paid me ₹300": a repayment into an account, of any amount. Recorded as money in tagged to Arun, never income. */
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
  const left = draft.owed - draft.amount
  const effect = draft.owed <= 0
    ? `${draft.person_name} didn’t owe you anything, so you’ll hold ${formatMinor(draft.amount - draft.owed, draft.currency)} of theirs.`
    : left > 0
      ? `${draft.person_name} owed ${formatMinor(draft.owed, draft.currency)}; ${formatMinor(left, draft.currency)} will be left.`
      : left === 0
        ? `That settles what ${draft.person_name} owed.`
        : `That’s ${formatMinor(-left, draft.currency)} more than ${draft.person_name} owed; you’ll hold it for them.`

  async function handleConfirm() {
    setBusy(true)
    try { await onConfirm({ ...draft, account_id: receiveInto }, { enabled: false, period: 'monthly', intervalCount: 1 }) }
    finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4" role="group" aria-label="Paid back">
      <h2 className="text-[15px] font-semibold">{draft.owed > 0 ? 'Paid back' : `Money from ${draft.person_name}`}</h2>
      <p className="text-[15px]">
        <span className="font-semibold">{draft.person_name}</span> paid{' '}
        <span className="tabular-nums">{currencySymbol(draft.currency)}{major.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>.
        {' '}{effect}
      </p>
      <Label className="flex-wrap text-[13px] font-semibold">
        <span>Paid into</span>
        <NativeSelect
          value={receiveInto ?? ''}
          onChange={e => { setTouched(true); setAccountId(e.target.value || null) }}
          className={cn(SELECT_PILL, '[&_select]:bg-background')}
          aria-label="Account the repayment landed in"
        >
          <NativeSelectOption value="">No account</NativeSelectOption>
          {accounts.map(acc => <NativeSelectOption key={acc.id} value={acc.id}>{acc.name}</NativeSelectOption>)}
        </NativeSelect>
      </Label>
      <p className="text-[13px] text-muted-foreground">It tops up the account and isn’t counted as income. If a bank alert for it arrives later, Needs you will match it to this, so it counts once.</p>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="flex-[2]" onClick={handleConfirm} disabled={busy}>
          Save repayment
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
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl bg-card py-2.5 pl-4 pr-2.5">
      <span className="text-[15px]">
        Budget · <span className="font-semibold">{draft.category_name}</span> ·{' '}
        <span className="tabular-nums">{currencySymbol(draft.currency)}{major.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>/mo
      </span>
      <span className="flex items-center gap-2">
        <Button variant="ghost" aria-label="Cancel" className="px-3 font-medium" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button aria-label="Confirm budget" className="px-5" onClick={handleConfirm} disabled={busy}>Set</Button>
      </span>
    </div>
  )
}
