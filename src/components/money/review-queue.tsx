'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { AttentionRow } from '@/components/shared/attention-row'
import { CategoryPicker } from '@/components/money/category-picker'
import { EntryTimestamp } from '@/components/money/entry-timestamp'
import { FOOT_LINK, SectionHeading } from '@/components/money/section-heading'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useMoneyRowActions } from '@/hooks/use-money-row-actions'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { usePeople } from '@/hooks/use-people'
import { useExpenseShares } from '@/hooks/use-expense-shares'
import { amountInputText, checkPaidFor, type PaidForProblem } from '@/lib/paid-for'
import type { ShareDraftRow } from '@/lib/share-edit'
import { reviewQueue, type ReviewItem } from '@/lib/review-queue'
import { currencySymbol, formatMinor } from '@/lib/currency'
import { formatLocalDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AccountRow } from '@/lib/dexie'

const SHOWN = 4

type Pick = { category: { id: string; name: string } | null; account: AccountRow | null; paidFor: ShareDraftRow[] }

/**
 * "Needs you": email and SMS imports that still want a category or an account,
 * at the top of Money home (owner decision, 13 Nov 2026). Each one is a white
 * attention row with a single action; choosing opens its review below the row.
 * Renders nothing when clear.
 */
export function ReviewQueue({ userId, focusId }: { userId: string; focusId?: string | null }) {
  const entries = useMoneyEntries(userId)
  const { setCategory, linkCard, paidFor, activeAccounts } = useMoneyRowActions(userId)
  const items = useMemo(() => reviewQueue(entries, activeAccounts.length), [entries, activeAccounts.length])
  const shares = useExpenseShares(userId)
  const sharedEntryIds = useMemo(() => new Set(shares.map(s => s.money_entry_id)), [shares])
  const [open, setOpen] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [handledFocus, setHandledFocus] = useState<string | null>(null)

  // Push deep-link (/app?categorize=<id>): open that entry's review once and bring it into view.
  if (focusId && focusId !== handledFocus && items.some(i => i.entry.id === focusId)) {
    setHandledFocus(focusId)
    setOpen(focusId)
    if (items.findIndex(i => i.entry.id === focusId) >= SHOWN) setShowAll(true)
  }
  useEffect(() => {
    if (!handledFocus) return
    requestAnimationFrame(() => document.getElementById(`review-${handledFocus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  }, [handledFocus])

  if (items.length === 0) return null
  const shown = items.slice(0, SHOWN)
  const extra = items.slice(SHOWN)

  // Save what was chosen, then move on to the next entry in the queue (if any).
  // An entry that still needs something (say, only "paid for" was saved and it
  // has no category yet) stays open instead of being skipped past.
  async function save(item: ReviewItem, pick: Pick) {
    const index = items.findIndex(i => i.entry.id === item.entry.id)
    const next = items[index + 1]?.entry.id ?? null
    if (resolves(item, pick)) {
      setOpen(next)
      if (next && index + 1 >= SHOWN) setShowAll(true)
    }
    if (pick.category) await setCategory(item.entry, pick.category.id, pick.category.name)
    if (pick.account && item.cardLast4) await linkCard(item.entry, item.cardLast4, pick.account)
    if (pick.paidFor.length > 0) await paidFor(item.entry, pick.paidFor)
  }

  const renderItem = (item: ReviewItem, index: number) => {
    const { entry: e, needsCategory, cardLast4 } = item
    const isOpen = open === e.id
    const title = e.description || e.merchant || 'Imported entry'
    const need = needsCategory
      ? cardLast4 ? 'No category or account yet.' : 'No category yet.'
      : `Card •${cardLast4} has no account yet.`
    return (
      <li key={e.id} id={`review-${e.id}`} className={cn('rounded-2xl', isOpen && 'bg-card')}>
        <AttentionRow
          title={title}
          detail={<>{e.source === 'sms' ? 'From SMS' : 'From email'}, <EntryTimestamp occurredAt={e.occurred_at} className="tabular-nums" />. {need}</>}
          value={e.direction === 'in'
            ? <span className="text-income">+{formatMinor(e.amount, e.currency)}</span>
            : formatMinor(e.amount, e.currency)}
          action={
            <Button
              variant="outline"
              aria-expanded={isOpen}
              aria-controls={isOpen ? `review-panel-${e.id}` : undefined}
              aria-label={isOpen ? `Close ${title}` : `Choose for ${title}`}
              onClick={() => setOpen(isOpen ? null : e.id)}
            >
              {isOpen ? 'Close' : 'Choose'}
            </Button>
          }
        />
        {isOpen && (
          <ReviewEditor
            key={e.id}
            userId={userId}
            item={item}
            accounts={activeAccounts}
            hasNext={index < items.length - 1}
            canPayFor={e.direction === 'out' && !sharedEntryIds.has(e.id)}
            onSave={pick => void save(item, pick)}
            onClose={() => setOpen(null)}
          />
        )}
      </li>
    )
  }

  return (
    <section aria-labelledby="needs-you-heading" className="flex flex-col">
      <SectionHeading
        id="needs-you-heading"
        ruled={false}
        aside={<p className="shrink-0 text-[13px] font-semibold text-warning lg:text-sm">{items.length} open</p>}
      >
        Needs you
      </SectionHeading>
      <Collapsible open={showAll} onOpenChange={setShowAll} className="flex flex-col">
        <ul className="flex flex-col gap-2 pt-2">
          {shown.map((it, i) => renderItem(it, i))}
        </ul>
        {extra.length > 0 && (
          <CollapsibleContent>
            <ul className="flex flex-col gap-2 pt-2">
              {extra.map((it, i) => renderItem(it, SHOWN + i))}
            </ul>
          </CollapsibleContent>
        )}
        {items.length > SHOWN && (
          <CollapsibleTrigger className={cn(FOOT_LINK, 'mt-1')}>
            {showAll ? 'Show fewer' : `Show all ${items.length}`}
          </CollapsibleTrigger>
        )}
      </Collapsible>
    </section>
  )
}

const NEW_PERSON = '__new__'

/** True when `pick` settles everything `item` was in the queue for. */
function resolves(item: ReviewItem, pick: Pick): boolean {
  return (!item.needsCategory || !!pick.category) && (!item.cardLast4 || !!pick.account)
}

/** The one line under "Paid for someone?" saying why Save is waiting. */
function paidForHint(problem: PaidForProblem | 'who', spent: string): string {
  switch (problem) {
    case 'who': return 'Pick who will pay you back, or choose “Not for someone”.'
    case 'name': return 'Type their name.'
    case 'amount': return 'Type how much they’ll pay back.'
    case 'too-much': return `That’s more than the ${spent} you spent.`
  }
}
const LEGEND = 'mb-0 w-full border-b border-border pb-2.5 text-[17px] font-bold tracking-[-0.02em]'

/**
 * Reviewing one imported entry: the facts, then a radio-style list for each thing it
 * still needs, one primary action and one text action. Nothing is saved until Save.
 */
function ReviewEditor({ userId, item, accounts, hasNext, canPayFor, onSave, onClose }: {
  userId: string
  item: ReviewItem
  accounts: AccountRow[]
  hasNext: boolean
  /** A spend with no shares yet: offer "Paid for someone?". */
  canPayFor: boolean
  onSave: (pick: Pick) => void
  onClose: () => void
}) {
  const { entry: e, needsCategory, cardLast4 } = item
  const { prefs } = useUserPrefs()
  const [pick, setPick] = useState<Omit<Pick, 'paidFor'>>({ category: null, account: null })
  const account = e.account_id ? accounts.find(a => a.id === e.account_id) : undefined

  // "Paid for someone?": closed by default. `who` is a person id, NEW_PERSON, or '' (not chosen yet).
  const people = usePeople(userId)
  const [payingFor, setPayingFor] = useState(false)
  const [who, setWho] = useState('')
  const [newName, setNewName] = useState('')
  const [owedText, setOwedText] = useState(() => amountInputText(e.amount, e.currency))
  const person = people.find(p => p.id === who)
  // Only while the section is open (and the entry has no shares yet, so a save
  // that kept this editor open can never write the share twice).
  const asking = canPayFor && payingFor
  const check = !asking ? null
    : who === NEW_PERSON ? checkPaidFor(e.amount, e.currency, { personId: null, name: newName, amountText: owedText })
    : person ? checkPaidFor(e.amount, e.currency, { personId: person.id, name: person.name, amountText: owedText })
    : null
  const problem: PaidForProblem | 'who' | null = !asking ? null : !check ? 'who' : check.ok ? null : check.problem
  const paidFor = check?.ok ? check.rows : []
  const canSave = problem === null && (!!pick.category || !!pick.account || paidFor.length > 0)
  const advances = hasNext && resolves(item, { ...pick, paidFor })
  const spent = formatMinor(e.amount, e.currency)
  const openId = `paid-for-open-${e.id}`
  const legendId = `paid-for-legend-${e.id}`
  const hintId = `paid-for-hint-${e.id}`

  // Focus follows the control that replaced the one just pressed (it unmounts).
  function openPayingFor() {
    setPayingFor(true)
    if (people.length === 0) setWho(NEW_PERSON)
    requestAnimationFrame(() => document.getElementById(legendId)?.focus())
  }
  function closePayingFor() {
    setPayingFor(false); setWho(''); setNewName(''); setOwedText(amountInputText(e.amount, e.currency))
    requestAnimationFrame(() => document.getElementById(openId)?.focus())
  }

  return (
    <div id={`review-panel-${e.id}`} className="flex flex-col gap-6 px-4 pb-4">
      <dl className="flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-3.5">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">When</dt>
          <dd className="text-[15px] font-semibold tabular-nums">{formatLocalDateTime(e.occurred_at, prefs.tz)}</dd>
        </div>
        {account && (
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{e.direction === 'out' ? 'From' : 'Into'}</dt>
            <dd className="text-[15px] font-semibold">{account.name}</dd>
          </div>
        )}
        {e.merchant && e.merchant !== (e.description || e.merchant) && (
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Merchant</dt>
            <dd className="text-[15px] font-semibold">{e.merchant}</dd>
          </div>
        )}
      </dl>

      {needsCategory && (
        <FieldSet className="min-w-0 gap-0">
          <FieldLegend className={LEGEND}>{e.direction === 'out' ? 'What was it for?' : 'What was it from?'}</FieldLegend>
          <CategoryPicker
            userId={userId}
            kind={e.direction === 'out' ? 'spend' : 'income'}
            selectedId={pick.category?.id ?? e.category_id}
            onSelect={(id, name) => setPick(p => ({ ...p, category: { id, name } }))}
          />
        </FieldSet>
      )}

      {cardLast4 && (
        <FieldSet className="min-w-0 gap-0">
          <FieldLegend className={LEGEND}>Which account is •{cardLast4}?</FieldLegend>
          <RadioGroup
            aria-label={`Account for card ending ${cardLast4}`}
            value={pick.account?.id ?? ''}
            onValueChange={id => setPick(p => ({ ...p, account: accounts.find(a => a.id === id) ?? null }))}
            className="gap-0"
          >
            {accounts.map(acc => (
              <Label
                key={acc.id}
                className={cn(
                  'min-h-13 gap-3 border-b border-border px-1 text-[15px] tracking-normal text-foreground',
                  pick.account?.id === acc.id ? 'font-semibold' : 'font-medium',
                )}
              >
                <RadioGroupItem value={acc.id} className="size-5 border-muted-foreground" />
                {acc.name}
              </Label>
            ))}
          </RadioGroup>
          <p className="pt-2.5 text-[13px] text-muted-foreground">Lifeloom will remember this card for its future alerts.</p>
        </FieldSet>
      )}

      {canPayFor && !payingFor && (
        <Button id={openId} variant="link" onClick={openPayingFor} className="-mt-2 self-start px-0">
          I paid this for someone
        </Button>
      )}

      {canPayFor && payingFor && (
        <FieldSet className="min-w-0 gap-0">
          <FieldLegend id={legendId} tabIndex={-1} className={cn(LEGEND, 'outline-none')}>Who will pay you back?</FieldLegend>
          <RadioGroup
            aria-label="Who will pay you back"
            value={who}
            onValueChange={v => setWho(String(v))}
            className="gap-0"
          >
            {[...people.map(p => ({ id: p.id, name: p.name })), { id: NEW_PERSON, name: 'Someone new' }].map(p => (
              <Label
                key={p.id}
                className={cn(
                  'min-h-13 gap-3 border-b border-border px-1 text-[15px] tracking-normal text-foreground',
                  who === p.id ? 'font-semibold' : 'font-medium',
                )}
              >
                <RadioGroupItem value={p.id} className="size-5 border-muted-foreground" />
                {p.name}
              </Label>
            ))}
          </RadioGroup>
          {who === NEW_PERSON && (
            <Input
              value={newName}
              maxLength={60}
              // Only when there is nobody else to pick; arrowing onto "Someone new" keeps focus in the list.
              autoFocus={people.length === 0}
              aria-invalid={problem === 'name' || undefined}
              onChange={ev => setNewName(ev.currentTarget.value)}
              placeholder="Their name"
              aria-label="Name of the person you paid for"
              className="mt-3 max-w-xs bg-background"
            />
          )}
          <div className="flex items-center gap-3 pt-3">
            <Label htmlFor={`owed-${e.id}`} className="text-[15px] font-medium tracking-normal">They’ll pay back ({currencySymbol(e.currency)})</Label>
            <Input
              id={`owed-${e.id}`}
              inputMode="decimal"
              aria-describedby={hintId}
              aria-invalid={problem === 'amount' || problem === 'too-much' || undefined}
              value={owedText}
              onChange={ev => setOwedText(ev.currentTarget.value)}
              className="w-28 bg-background px-3 text-right"
            />
          </div>
          <p id={hintId} className="pt-2.5 text-[13px] text-muted-foreground">
            Starts at the whole {spent}; change it if they owe only part. Their part won’t count as your spending, and the People page tracks it until they pay.
          </p>
          <p className="pt-1.5 text-[13px] font-medium text-foreground" aria-live="polite">
            {problem ? paidForHint(problem, spent) : ''}
          </p>
          <Button variant="link" onClick={closePayingFor} className="self-start px-0">
            Not for someone
          </Button>
        </FieldSet>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
        <Button size="lg" disabled={!canSave} onClick={() => onSave({ ...pick, paidFor })}>
          {advances ? 'Save and show the next one' : 'Save'}
        </Button>
        <Button variant="link" onClick={onClose}>Not now</Button>
      </div>
    </div>
  )
}
