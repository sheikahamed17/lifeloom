'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useMoneyRowActions, type RepaymentPick } from '@/hooks/use-money-row-actions'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { usePeople } from '@/hooks/use-people'
import { useAllPeople } from '@/hooks/use-all-people'
import { useExpenseShares } from '@/hooks/use-expense-shares'
import { amountInputText, checkPaidFor, type PaidForProblem } from '@/lib/paid-for'
import { matchNames, suggestPayer } from '@/lib/people-match'
import { owedByPerson, owesAndHolds, recordedTwin } from '@/lib/shares'
import type { ShareDraftRow } from '@/lib/share-edit'
import { reviewQueue, type ReviewItem } from '@/lib/review-queue'
import { currencySymbol, formatMinor } from '@/lib/currency'
import { formatLocalDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AccountRow, MoneyEntryRow, PersonRow } from '@/lib/dexie'

const SHOWN = 4

type Pick = {
  category: { id: string; name: string } | null
  account: AccountRow | null
  paidFor: ShareDraftRow[]
  /** Set → this entry is a repayment with that person (money in from them, or theirs given back). */
  repayment: RepaymentPick | null
}

/** Someone you hold money for, in one currency (they paid you before you spent it). */
type Holder = { personId: string; name: string; amount: number }

/**
 * "Needs you": email and SMS imports that still want a category or an account,
 * at the top of Money home (owner decision, 13 Nov 2026). Each one is a white
 * attention row with a single action; choosing opens its review below the row.
 * Renders nothing when clear.
 */
export function ReviewQueue({ userId, focusId }: { userId: string; focusId?: string | null }) {
  const entries = useMoneyEntries(userId)
  const { setCategory, linkCard, paidFor, markRepayment, activeAccounts } = useMoneyRowActions(userId)
  const items = useMemo(() => reviewQueue(entries, activeAccounts.length), [entries, activeAccounts.length])
  const shares = useExpenseShares(userId)
  const people = usePeople(userId)
  const allPeople = useAllPeople(userId)
  const sharedEntryIds = useMemo(() => new Set(shares.map(s => s.money_entry_id)), [shares])
  // Who you hold money for, per currency: their money going back out is "giving it back".
  const holders = useMemo(() => {
    const map = new Map<string, Holder[]>()
    for (const row of owedByPerson(entries, shares, allPeople)) {
      for (const [currency, amount] of owesAndHolds(row).holds) {
        map.set(currency, [...(map.get(currency) ?? []), { personId: row.personId, name: row.name, amount }])
      }
    }
    return map
  }, [entries, shares, allPeople])
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
    if (pick.repayment) await markRepayment(item.entry, pick.repayment)
    else if (pick.category) await setCategory(item.entry, pick.category.id, pick.category.name)
    if (pick.account && item.cardLast4) await linkCard(item.entry, item.cardLast4, pick.account)
    if (pick.paidFor.length > 0) await paidFor(item.entry, pick.paidFor)
  }

  const renderItem = (item: ReviewItem, index: number) => {
    const { entry: e, needsCategory, cardLast4 } = item
    const isOpen = open === e.id
    const title = e.description || e.merchant || 'Imported entry'
    // A credit that duplicates a repayment you recorded by hand is that person's, first.
    const found = e.direction === 'in' ? recordedTwin(e, entries) : null
    const twin = found && people.some(p => p.id === found.settles_person_id) ? found : null
    const suggested = twin?.settles_person_id
      ? { personId: twin.settles_person_id }
      : e.direction === 'in' ? suggestPayer(e.merchant, people) : null
    const suggestedName = suggested ? people.find(p => p.id === suggested.personId)?.name : undefined
    const need = twin && suggestedName
      ? `The ${formatMinor(e.amount, e.currency)} from ${suggestedName} you recorded?`
      : suggestedName
      ? `${suggestedName} paying you back?`
      : needsCategory
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
            people={people}
            suggestedId={suggested?.personId ?? null}
            twin={twin?.settles_person_id ? twin : null}
            holders={e.direction === 'out' && !sharedEntryIds.has(e.id) ? (holders.get(e.currency) ?? []) : []}
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
const NOT_REPAYMENT = '__income__'

/** True when `pick` settles everything `item` was in the queue for (a repayment needs no category). */
function resolves(item: ReviewItem, pick: Pick): boolean {
  return (!item.needsCategory || !!pick.category || !!pick.repayment) && (!item.cardLast4 || !!pick.account)
}

type Problem = PaidForProblem | 'who' | 'payer'

/** The one line under a person section saying why Save is waiting. */
function problemHint(problem: Problem, spent: string): string {
  switch (problem) {
    case 'who': return 'Pick who will pay you back, or choose “Not for someone”.'
    case 'payer': return 'Pick who it’s from, or “No, it’s income”.'
    case 'name': return 'Type their name.'
    case 'amount': return 'Type how much they’ll pay back.'
    case 'too-much': return `That’s more than the ${spent} you spent.`
  }
}
const LEGEND = 'mb-0 w-full border-b border-border pb-2.5 text-[17px] font-bold tracking-[-0.02em]'
const RADIO_ROW = 'min-h-13 gap-3 border-b border-border px-1 text-[15px] tracking-normal text-foreground'

/** One ruled radio row: a label, and an optional quieter detail after it. */
function RadioRow({ value, selected, label, detail }: { value: string; selected: boolean; label: string; detail?: string }) {
  return (
    <Label className={cn(RADIO_ROW, 'py-2', selected ? 'font-semibold' : 'font-medium')}>
      <RadioGroupItem value={value} className="size-5 border-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span>{label}</span>
        {detail && <span className="break-words text-[13px] font-normal text-muted-foreground">{detail}</span>}
      </span>
    </Label>
  )
}

/**
 * Reviewing one imported entry: the facts, then a radio-style list for each thing it
 * still needs, one primary action and one text action. Nothing is saved until Save.
 *
 * Money in can be someone paying you back (suggested when the sender matches one
 * of your people, never assumed); a spend can be paid for someone, or someone's
 * money you're giving back. A repayment needs no category.
 */
function ReviewEditor({ userId, item, accounts, people, suggestedId, twin, holders, hasNext, canPayFor, onSave, onClose }: {
  userId: string
  item: ReviewItem
  accounts: AccountRow[]
  people: PersonRow[]
  /** The person a credit's sender matches, if any (money in only). */
  suggestedId: string | null
  /** A repayment you recorded by hand that this credit is probably the same money as. */
  twin: MoneyEntryRow | null
  /** People you hold money for in this entry's currency (spends only). */
  holders: Holder[]
  hasNext: boolean
  /** A spend with no shares yet: offer "Paid for someone?". */
  canPayFor: boolean
  onSave: (pick: Pick) => void
  onClose: () => void
}) {
  const { entry: e, needsCategory, cardLast4 } = item
  const { prefs } = useUserPrefs()
  const [pick, setPick] = useState<{ category: Pick['category']; account: Pick['account'] }>({ category: null, account: null })
  const account = e.account_id ? accounts.find(a => a.id === e.account_id) : undefined
  const spent = formatMinor(e.amount, e.currency)

  // Which person section is open. Money in with a matching sender opens on the
  // question, so a likely repayment is always asked about, never skipped past.
  const [section, setSection] = useState<null | 'paidFor' | 'from' | 'giveBack'>(
    e.direction === 'in' && suggestedId ? 'from' : null,
  )
  // `who` is a person id, NEW_PERSON, NOT_REPAYMENT, or '' (not chosen yet).
  const [who, setWho] = useState('')
  const [newName, setNewName] = useState('')
  const [owedText, setOwedText] = useState(() => amountInputText(e.amount, e.currency))
  const [remember, setRemember] = useState(true)
  const person = people.find(p => p.id === who)
  const chosenName = who === NEW_PERSON ? newName.trim() : person?.name ?? ''

  // "Paid for someone" (only while that section is open, and only on an entry
  // with no shares yet, so a save that keeps this editor open can't write twice).
  const asking = canPayFor && section === 'paidFor'
  const check = !asking ? null
    : who === NEW_PERSON ? checkPaidFor(e.amount, e.currency, { personId: null, name: newName, amountText: owedText })
    : person ? checkPaidFor(e.amount, e.currency, { personId: person.id, name: person.name, amountText: owedText })
    : null
  const paidFor = check?.ok ? check.rows : []

  // A repayment: money in from someone, or their money going back out.
  const sender = e.merchant?.trim() || null
  const alreadyRemembered = !!person && !!sender && matchNames(person.match_names).some(n => n.toLocaleLowerCase() === sender.toLocaleLowerCase())
  const offerRemember = section === 'from' && !!sender && (who === NEW_PERSON || (!!person && !alreadyRemembered))
  // Choosing the twin's person means "this is the money I recorded": the bank entry replaces it.
  const replaces = twin && who === twin.settles_person_id ? twin.id : null
  const repayment: RepaymentPick | null =
    (section === 'from' || section === 'giveBack') && who && who !== NOT_REPAYMENT && chosenName
      ? { personId: who === NEW_PERSON ? null : who, name: chosenName, remember: offerRemember && remember ? sender : null, replaces }
      : null

  const problem: Problem | null =
    asking ? (!check ? 'who' : check.ok ? null : check.problem)
    : section === 'from' ? (!who ? 'payer' : who === NEW_PERSON && !newName.trim() ? 'name' : null)
    : section === 'giveBack' ? (!who ? 'payer' : null)
    : null
  const isRepayment = !!repayment
  const canSave = problem === null && (!!pick.category || !!pick.account || paidFor.length > 0 || isRepayment)
  const advances = hasNext && resolves(item, { ...pick, paidFor, repayment })

  const ids = {
    paidForOpen: `paid-for-open-${e.id}`,
    fromOpen: `from-open-${e.id}`,
    giveBackOpen: `give-back-open-${e.id}`,
    legend: `person-legend-${e.id}`,
    hint: `person-hint-${e.id}`,
  }
  // Focus follows the control that replaced the one just pressed (it unmounts).
  function openSection(next: 'paidFor' | 'from' | 'giveBack') {
    setSection(next); setWho(''); setNewName(''); setRemember(true)
    if (next === 'paidFor' && people.length === 0) setWho(NEW_PERSON)
    requestAnimationFrame(() => document.getElementById(ids.legend)?.focus())
  }
  function closeSection() {
    const back = section === 'paidFor' ? ids.paidForOpen : section === 'giveBack' ? ids.giveBackOpen : ids.fromOpen
    setSection(null); setWho(''); setNewName(''); setOwedText(amountInputText(e.amount, e.currency))
    requestAnimationFrame(() => document.getElementById(back)?.focus())
  }

  // People for "who is it from?": the suggested sender first.
  const payerOptions = useMemo(() => {
    const list = people.map(p => ({ id: p.id, name: p.name }))
    const i = list.findIndex(p => p.id === suggestedId)
    return i > 0 ? [list[i], ...list.slice(0, i), ...list.slice(i + 1)] : list
  }, [people, suggestedId])

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
            <dt className="text-xs text-muted-foreground">{e.direction === 'in' ? 'Sender' : 'Merchant'}</dt>
            <dd className="text-[15px] font-semibold">{e.merchant}</dd>
          </div>
        )}
      </dl>

      {section === 'from' && (
        <FieldSet className="min-w-0 gap-0">
          <FieldLegend id={ids.legend} tabIndex={-1} className={cn(LEGEND, 'outline-none')}>Is this someone paying you back?</FieldLegend>
          <RadioGroup aria-label="Who this money is from" aria-describedby={ids.hint} value={who} onValueChange={v => setWho(String(v))} className="gap-0">
            {payerOptions.map(p => (
              <RadioRow
                key={p.id}
                value={p.id}
                selected={who === p.id}
                label={`Yes, ${p.name}`}
                detail={twin && p.id === twin.settles_person_id
                  ? `you recorded it ${formatLocalDateTime(twin.occurred_at, prefs.tz)}`
                  : p.id === suggestedId && sender ? `matches ${sender}` : undefined}
              />
            ))}
            <RadioRow value={NEW_PERSON} selected={who === NEW_PERSON} label="Yes, someone new" />
            <RadioRow value={NOT_REPAYMENT} selected={who === NOT_REPAYMENT} label="No, it’s income" />
          </RadioGroup>
          {who === NEW_PERSON && (
            <Input
              value={newName}
              maxLength={60}
              aria-invalid={problem === 'name' || undefined}
              onChange={ev => setNewName(ev.currentTarget.value)}
              placeholder="Their name"
              aria-label="Name of the person who sent it"
              className="mt-3 max-w-xs bg-background"
            />
          )}
          {offerRemember && (
            <Label className="min-h-13 gap-3 border-b border-border px-1 text-[15px] font-medium tracking-normal text-foreground">
              <Checkbox
                checked={remember}
                onCheckedChange={checked => setRemember(checked)}
                className="size-[22px] rounded-md border-2 border-foreground"
              />
              <span>Remember “{sender}” is {chosenName || 'them'}</span>
            </Label>
          )}
          <p id={ids.hint} className="pt-2.5 text-[13px] text-muted-foreground">
            {replaces
              ? 'This bank entry takes the place of the one you recorded, so the money counts once.'
              : 'A repayment isn’t income: it lowers what they owe you, or if they owe nothing yet, you hold it for them.'}
          </p>
          <p className="pt-1.5 text-[13px] font-medium text-foreground" aria-live="polite">{problem ? problemHint(problem, spent) : ''}</p>
          {!suggestedId && (
            <Button variant="link" onClick={closeSection} className="self-start px-0">Not a repayment</Button>
          )}
        </FieldSet>
      )}

      {needsCategory && !isRepayment && (
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
              <RadioRow key={acc.id} value={acc.id} selected={pick.account?.id === acc.id} label={acc.name} />
            ))}
          </RadioGroup>
          <p className="pt-2.5 text-[13px] text-muted-foreground">Lifeloom will remember this card for its future alerts.</p>
        </FieldSet>
      )}

      {section === null && (e.direction === 'in' || canPayFor || holders.length > 0) && (
        <div className="-mt-2 flex flex-col items-start">
          {e.direction === 'in' && (
            <Button id={ids.fromOpen} variant="link" onClick={() => openSection('from')} className="px-0">
              Someone paying me back
            </Button>
          )}
          {canPayFor && (
            <Button id={ids.paidForOpen} variant="link" onClick={() => openSection('paidFor')} className="px-0">
              I paid this for someone
            </Button>
          )}
          {holders.length > 0 && (
            <Button id={ids.giveBackOpen} variant="link" onClick={() => openSection('giveBack')} className="px-0">
              I was giving back someone’s money
            </Button>
          )}
        </div>
      )}

      {asking && (
        <FieldSet className="min-w-0 gap-0">
          <FieldLegend id={ids.legend} tabIndex={-1} className={cn(LEGEND, 'outline-none')}>Who will pay you back?</FieldLegend>
          <RadioGroup aria-label="Who will pay you back" value={who} onValueChange={v => setWho(String(v))} className="gap-0">
            {people.map(p => <RadioRow key={p.id} value={p.id} selected={who === p.id} label={p.name} />)}
            <RadioRow value={NEW_PERSON} selected={who === NEW_PERSON} label="Someone new" />
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
              aria-describedby={ids.hint}
              aria-invalid={problem === 'amount' || problem === 'too-much' || undefined}
              value={owedText}
              onChange={ev => setOwedText(ev.currentTarget.value)}
              className="w-28 bg-background px-3 text-right"
            />
          </div>
          <p id={ids.hint} className="pt-2.5 text-[13px] text-muted-foreground">
            Starts at the whole {spent}; change it if they owe only part. Their part won’t count as your spending, and the People page tracks it until they pay.
          </p>
          <p className="pt-1.5 text-[13px] font-medium text-foreground" aria-live="polite">{problem ? problemHint(problem, spent) : ''}</p>
          <Button variant="link" onClick={closeSection} className="self-start px-0">Not for someone</Button>
        </FieldSet>
      )}

      {section === 'giveBack' && (
        <FieldSet className="min-w-0 gap-0">
          <FieldLegend id={ids.legend} tabIndex={-1} className={cn(LEGEND, 'outline-none')}>Whose money was it?</FieldLegend>
          <RadioGroup aria-label="Whose money you gave back" aria-describedby={ids.hint} value={who} onValueChange={v => setWho(String(v))} className="gap-0">
            {holders.map(h => (
              <RadioRow key={h.personId} value={h.personId} selected={who === h.personId} label={h.name} detail={`you hold ${formatMinor(h.amount, e.currency)}`} />
            ))}
          </RadioGroup>
          <p id={ids.hint} className="pt-2.5 text-[13px] text-muted-foreground">
            Money you give back isn’t spending: it comes off what you hold for them.
          </p>
          <p className="pt-1.5 text-[13px] font-medium text-foreground" aria-live="polite">{problem ? problemHint(problem, spent) : ''}</p>
          <Button variant="link" onClick={closeSection} className="self-start px-0">Not giving money back</Button>
        </FieldSet>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
        <Button size="lg" disabled={!canSave} onClick={() => onSave({ ...pick, paidFor, repayment })}>
          {advances ? 'Save and show the next one' : 'Save'}
        </Button>
        <Button variant="link" onClick={onClose}>Not now</Button>
      </div>
    </div>
  )
}
