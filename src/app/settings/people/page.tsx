'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ChevronDown, Pencil } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { useAllPeople } from '@/hooks/use-all-people'
import { useExpenseShares } from '@/hooks/use-expense-shares'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useAccounts } from '@/hooks/use-accounts'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { createdAsRepayment, owedByPerson, owedTotal, owesAndHolds, repaymentCandidates } from '@/lib/shares'
import { parseAmountInput } from '@/lib/parse-amount'
import { amountInputText } from '@/lib/paid-for'
import { resurrectPayload } from '@/lib/undo-delete'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { FieldLegend, FieldSet } from '@/components/ui/field'
import { pickDefaultAccountId } from '@/lib/default-account'
import { convertViaRates } from '@/lib/fx'
import { formatMinor } from '@/lib/currency'
import { formatDay } from '@/lib/format'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { COUNT_CLASS, FormField, LABEL_CLASS, SELECT_CLASS, SettingsCard } from '../_ui'
import { PageShell } from '@/components/layout/page-shell'
import { AttentionRow } from '@/components/shared/attention-row'
import { IconTile } from '@/components/shared/icon-tile'
import { RowMenu } from '@/components/shared/row-menu'
import { UndoProvider, useUndo } from '@/components/providers/undo-provider'
import type { ExpenseShareRow, MoneyEntryRow, PersonRow } from '@/lib/dexie'

const fmt = formatMinor
const BACK = { href: '/settings', label: 'Settings' }
const DESCRIPTION = 'Paid for someone? Mark it in Needs you, or share it from the capture chip. When they pay you back, Needs you asks whether their bank credit is a repayment, or you can record it here. Repayments are never counted as income.'

export default function PeoplePage() {
  return (
    <UndoProvider>
      <PeoplePageInner />
    </UndoProvider>
  )
}

function PeoplePageInner() {
  const router = useRouter()
  const undo = useUndo()
  const [userId, setUserId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  const people = useAllPeople(userId ?? undefined)
  const shares = useExpenseShares(userId ?? undefined)
  const entries = useMoneyEntries(userId ?? undefined)
  const accounts = useAccounts(userId ?? undefined)
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])

  const live = useMemo(() => people.filter(p => !p.deleted_at), [people])
  const active = useMemo(() => live.filter(p => !p.is_archived), [live])
  const archived = useMemo(() => live.filter(p => !!p.is_archived), [live])
  const owed = useMemo(() => owedByPerson(entries, shares, live), [entries, shares, live])
  const owedFor = useMemo(() => new Map(owed.map(r => [r.personId, r])), [owed])
  const entryById = useMemo(() => new Map(entries.map(e => [e.id, e])), [entries])
  // Each person's repayment entries (money in from them, or theirs given back), newest first.
  const repaymentsFor = useMemo(() => {
    const map = new Map<string, MoneyEntryRow[]>()
    for (const e of entries) if (e.settles_person_id) map.set(e.settles_person_id, [...(map.get(e.settles_person_id) ?? []), e])
    return map
  }, [entries])
  const defaultAccountId = useMemo(() => pickDefaultAccountId(accounts), [accounts])

  const toPrimary = useMemo(
    () => (amount: number, currency: string) => {
      if (currency === prefs.primary_currency) return amount
      return convertViaRates(amount, currency, prefs.primary_currency, new Date().toISOString(), rates, prefs.fx_overrides ?? {})?.amount ?? null
    },
    [prefs.primary_currency, rates, prefs.fx_overrides],
  )
  const headline = useMemo(() => owedTotal(owed, toPrimary), [owed, toPrimary])
  // Each figure has one home: the page total only when it adds up more than one
  // person (otherwise it repeats that person's card).
  const showTotal = owed.filter(r => owesAndHolds(r).owes.length > 0).length > 1

  // Jump to the person a money-row pill linked to (#<personId>).
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return
    const id = window.location.hash.slice(1)
    if (!id) return
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ block: 'start' })
  }, [userId])

  async function op(entity_kind: 'person' | 'expense_share' | 'money', entity_id: string, op_type: 'create' | 'update' | 'delete', payload: Record<string, unknown>) {
    if (!userId) return
    await applyLocalOp(await generateOp({ entity_kind, entity_id, op_type, payload, user_id: userId }))
  }
  function sync() { if (userId) pushPullOnce({ userId }).catch(err => console.error('sync', err)) }

  async function addPerson() {
    const name = newName.trim()
    if (!name) return
    if (live.some(p => p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) { setNewName(''); return }
    await op('person', crypto.randomUUID(), 'create', { name, is_archived: 0 })
    setNewName('')
    sync()
  }

  async function settle(shareIds: string[], accountId: string | null) {
    if (busy || shareIds.length === 0) return
    setBusy(true)
    try {
      const settled_at = new Date().toISOString()
      for (const id of shareIds) await op('expense_share', id, 'update', { settled_at, settled_account_id: accountId })
      const total = shares.filter(s => shareIds.includes(s.id)).reduce((n, s) => n + s.amount, 0)
      const currency = entryById.get(shares.find(s => s.id === shareIds[0])?.money_entry_id ?? '')?.currency ?? prefs.primary_currency
      const acc = accounts.find(a => a.id === accountId)
      undo.push(
        `Marked ${fmt(total, currency)} paid${acc ? ` into ${acc.name}` : ''}`,
        async () => { for (const id of shareIds) await op('expense_share', id, 'update', { settled_at: null, settled_account_id: null }); sync() },
      )
      sync()
    } finally { setBusy(false) }
  }

  async function unsettle(shareId: string) {
    if (busy) return
    setBusy(true)
    try {
      await op('expense_share', shareId, 'update', { settled_at: null, settled_account_id: null })
      undo.push('Marked as still owed')
      sync()
    } finally { setBusy(false) }
  }

  // "Record a payment": tag money that came into the bank as theirs, or (cash,
  // or not imported) add it as a manual entry tagged to them; "Record money you
  // gave back" is the same for money going back out. Either way it is a real
  // entry, so the account balance is right and it is never income or spending.
  async function recordPayment(person: PersonRow, choice: RecordChoice) {
    if (busy) return
    setBusy(true)
    try {
      if (choice.kind === 'existing') {
        const previous = entryById.get(choice.entryId)?.settles_person_id ?? null
        await op('money', choice.entryId, 'update', { settles_person_id: person.id })
        undo.push(`${fmt(choice.amount, choice.currency)} from ${person.name} · counted as paying you back`, async () => {
          await op('money', choice.entryId, 'update', { settles_person_id: previous }); sync()
        })
      } else {
        const id = crypto.randomUUID()
        const back = choice.direction === 'out'
        await op('money', id, 'create', {
          amount: choice.amount, currency: choice.currency, direction: choice.direction, category_id: null,
          description: back ? `Back to ${person.name}` : `From ${person.name}`, occurred_at: new Date().toISOString(), source: 'manual',
          receipt_key: null, raw_input: null, recurring_rule_id: null, merchant: null, tags: [],
          account_id: choice.accountId, settles_person_id: person.id,
        })
        const acc = accounts.find(a => a.id === choice.accountId)
        const label = back
          ? `${fmt(choice.amount, choice.currency)} back to ${person.name}${acc ? ` from ${acc.name}` : ''}`
          : `${fmt(choice.amount, choice.currency)} from ${person.name}${acc ? ` into ${acc.name}` : ''}`
        undo.push(label, async () => {
          await op('money', id, 'delete', {}); sync()
        })
      }
      sync()
    } finally { setBusy(false) }
  }

  // Undo a repayment from the history: one recorded as a repayment (cash here,
  // or "Arun paid me 300") is removed; any other entry that was tagged (a bank
  // credit, or income you had typed) just goes back to being ordinary money.
  async function removeRepayment(e: MoneyEntryRow) {
    if (busy) return
    setBusy(true)
    try {
      const untag = !createdAsRepayment(e)
      if (untag) await op('money', e.id, 'update', { settles_person_id: null })
      else await op('money', e.id, 'delete', {})
      undo.push(untag ? 'No longer counted as a repayment' : 'Repayment removed', async () => {
        if (untag) await op('money', e.id, 'update', { settles_person_id: e.settles_person_id ?? null })
        else await op('money', e.id, 'update', resurrectPayload('money', e))   // re-asserting a field clears the tombstone
        sync()
      })
      sync()
    } finally { setBusy(false) }
  }

  async function rename(id: string, name: string) { await op('person', id, 'update', { name }); sync() }
  async function archive(id: string, archived: boolean) {
    await op('person', id, 'update', { is_archived: archived ? 1 : 0 })
    sync()
    if (archived) undo.push(`Archived ${live.find(p => p.id === id)?.name ?? 'person'}`, () => archive(id, false))
  }

  if (!userId) {
    return (
      <PageShell title="People" back={BACK} description={DESCRIPTION}>
        <Skeleton className="h-40 w-full rounded-xl" role="status" aria-label="Loading" />
      </PageShell>
    )
  }

  return (
    <PageShell title="People" back={BACK} description={DESCRIPTION}>
      <div className="flex flex-col gap-4">
        {showTotal && (
          <div className="flex items-end justify-between gap-2 border-b border-border pb-2.5">
            <h2 className="text-[19px] font-bold tracking-[-0.02em] lg:text-[22px]">Owed to you</h2>
            <span className="text-[19px] font-bold tabular-nums tracking-[-0.02em] lg:text-[22px]">{fmt(headline.total, prefs.primary_currency)}</span>
          </div>
        )}
        {showTotal && headline.skipped.length > 0 && (
          <p className="text-[13px] text-muted-foreground">Not converted (no exchange rate yet): {headline.skipped.join(', ')}</p>
        )}
        <FormField label="Add a person" htmlFor="new-person">
          <div className="flex gap-2">
            <Input
              id="new-person"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPerson() } }}
              placeholder="Their name"
              maxLength={60}
              aria-label="New person name"
            />
            <Button className="h-12 shrink-0 px-5" onClick={addPerson} disabled={!newName.trim()}>Add</Button>
          </div>
        </FormField>
      </div>

      {active.length === 0 && (
        <Empty className="rounded-none border-y border-border px-0 py-6">
          <EmptyDescription>No people yet. Add someone above, or share an expense from the capture chip.</EmptyDescription>
        </Empty>
      )}

      {active.map(p => (
        <PersonCard
          key={p.id}
          person={p}
          owed={owedFor.get(p.id)}
          shares={shares.filter(s => s.person_id === p.id)}
          entryById={entryById}
          entries={entries}
          repayments={repaymentsFor.get(p.id) ?? []}
          accounts={accounts}
          defaultAccountId={defaultAccountId}
          tz={prefs.tz}
          busy={busy}
          onSettle={settle}
          onUnsettle={unsettle}
          onRecord={choice => recordPayment(p, choice)}
          onRemoveRepayment={removeRepayment}
          onRename={rename}
          onArchive={id => archive(id, true)}
        />
      ))}

      {archived.length > 0 && (
        <SettingsCard
          title="Archived"
          className="gap-0"
          contentClassName="gap-0"
          action={<span className={COUNT_CLASS}>{archived.length} {archived.length === 1 ? 'person' : 'people'}</span>}
        >
          <ul>
            {archived.map(p => {
              const stillOwes = owedFor.get(p.id)
              return (
                <li key={p.id} id={p.id} className="flex min-h-14 scroll-mt-4 items-center gap-3 border-b border-border py-2">
                  <IconTile name={p.name} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-medium">{p.name}</span>
                    {stillOwes && owesAndHolds(stillOwes).owes.length > 0 && (
                      <span className="text-[13px] text-muted-foreground">
                        Still owes you {owesAndHolds(stillOwes).owes.map(([c, a]) => fmt(a, c)).join(', ')}
                      </span>
                    )}
                    {stillOwes && owesAndHolds(stillOwes).holds.length > 0 && (
                      <span className="text-[13px] text-muted-foreground">
                        You hold {owesAndHolds(stillOwes).holds.map(([c, a]) => fmt(a, c)).join(', ')} of theirs
                      </span>
                    )}
                  </div>
                  <Button variant="link" className="shrink-0 px-1" onClick={() => archive(p.id, false)} aria-label={`Restore ${p.name}`}>Restore</Button>
                </li>
              )
            })}
          </ul>
        </SettingsCard>
      )}
    </PageShell>
  )
}


/** What "Record a payment" saves: money already in the list, or a new cash/manual entry (in: from them; out: back to them). */
type RecordChoice =
  | { kind: 'existing'; entryId: string; amount: number; currency: string }
  | { kind: 'cash'; direction: 'in' | 'out'; amount: number; currency: string; accountId: string | null }

function PersonCard({
  person, owed, shares, entryById, entries, repayments, accounts, defaultAccountId, tz, busy,
  onSettle, onUnsettle, onRecord, onRemoveRepayment, onRename, onArchive,
}: {
  person: PersonRow
  busy: boolean
  owed: ReturnType<typeof owedByPerson>[number] | undefined
  shares: ExpenseShareRow[]
  entryById: Map<string, MoneyEntryRow>
  entries: MoneyEntryRow[]
  /** Their repayment entries, newest first. */
  repayments: MoneyEntryRow[]
  accounts: { id: string; name: string; icon: string | null }[]
  defaultAccountId: string | null
  tz: string
  onSettle: (shareIds: string[], accountId: string | null) => void
  onUnsettle: (shareId: string) => void
  onRecord: (choice: RecordChoice) => void
  onRemoveRepayment: (e: MoneyEntryRow) => void
  onRename: (id: string, name: string) => void
  onArchive: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(person.name)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [accountTouched, setAccountTouched] = useState(false)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const receiveInto = accountTouched ? accountId : defaultAccountId

  const { owes, holds } = owed ? owesAndHolds(owed) : { owes: [] as [string, number][], holds: [] as [string, number][] }
  const outstanding = owed?.shares ?? []
  // "Mark paid" settles one item outright. While a repayment is already partly
  // covering their debts, only "Record a payment" is offered, so the same money
  // can't be counted twice.
  const canMarkPaid = outstanding.length > 0 && !outstanding.some(s => s.paid > 0)
  const recordOpenId = `record-open-${person.id}`
  const headingId = `person-heading-${person.id}`
  const legendId = `record-${person.id}`
  // Focus follows the panel: into it when it opens; back to its button on
  // Cancel; to the person's heading after a save (the balance just changed and
  // the button may be about to go, and the toast says what happened).
  function openRecording() {
    setRecording(true)
    requestAnimationFrame(() => document.getElementById(legendId)?.focus())
  }
  function closeRecording(saved: boolean) {
    setRecording(false)
    requestAnimationFrame(() => document.getElementById(saved ? headingId : recordOpenId)?.focus())
  }
  // History: shares marked paid, and repayment entries, newest first.
  const history = useMemo(() => {
    const settledShares = shares
      .filter(s => s.settled_at && entryById.get(s.money_entry_id) && !entryById.get(s.money_entry_id)!.deleted_at)
      .map(s => ({ kind: 'share' as const, at: s.settled_at ?? '', share: s }))
    const paid = repayments.map(e => ({ kind: 'repayment' as const, at: e.occurred_at, entry: e }))
    return [...settledShares, ...paid].sort((a, b) => b.at.localeCompare(a.at))
  }, [shares, entryById, repayments])
  // A header total only when one row doesn't already say it.
  const showOwes = owes.length > 0 && (outstanding.length > 1 || outstanding.some(s => s.paid > 0) || holds.length > 0)

  return (
    <section id={person.id} className="flex scroll-mt-4 flex-col">
      <div className="flex min-h-[54px] items-center justify-between gap-2 border-b border-border pb-1">
        {editing ? (
          <div className="flex flex-1 flex-wrap gap-2 pb-2">
            <Input className="min-w-40 flex-1" value={name} onChange={e => setName(e.target.value)} maxLength={60} autoFocus aria-label={`Rename ${person.name}`} />
            <Button className="h-12" onClick={() => { const n = name.trim(); if (n && n !== person.name) onRename(person.id, n); setEditing(false) }}>Save</Button>
            <Button className="h-12" variant="outline" onClick={() => { setName(person.name); setEditing(false) }}>Cancel</Button>
          </div>
        ) : (
          <>
            <h2 id={headingId} tabIndex={-1} className="min-w-0 flex-1 truncate text-[19px] font-bold tracking-[-0.02em] outline-none lg:text-[22px]">{person.name}</h2>
            <div className="flex flex-col items-end">
              {showOwes && (
                <span className="whitespace-nowrap text-[13px] text-muted-foreground">
                  owes you <span className="text-[15px] font-semibold tabular-nums text-foreground">{owes.map(([c, a]) => fmt(a, c)).join(' + ')}</span>
                </span>
              )}
              {holds.length > 0 && (
                <span className="whitespace-nowrap text-[13px] text-muted-foreground">
                  you hold <span className="text-[15px] font-semibold tabular-nums text-foreground">{holds.map(([c, a]) => fmt(a, c)).join(' + ')}</span> of theirs
                </span>
              )}
              {!owed && <span className="text-[13px] text-muted-foreground">Settled up</span>}
            </div>
            <div className="-mr-2.5 flex shrink-0">
              <RowMenu
                label={`Actions for ${person.name}`}
                open={menuOpen}
                onOpenChange={setMenuOpen}
                items={[
                  { label: 'Rename', icon: Pencil, onSelect: () => setEditing(true) },
                  { label: 'Archive', icon: Archive, onSelect: () => onArchive(person.id) },
                ]}
              />
            </div>
          </>
        )}
      </div>

      {canMarkPaid && !recording && (
        <div className="flex flex-col gap-2 pt-4">
          <Label htmlFor={`receive-${person.id}`} className={LABEL_CLASS}>Paid into</Label>
          <div className="flex gap-2">
            <NativeSelect
              id={`receive-${person.id}`}
              value={receiveInto ?? ''}
              onChange={e => { setAccountTouched(true); setAccountId(e.target.value || null) }}
              className={cn(SELECT_CLASS, 'min-w-0 flex-1')}
            >
              <NativeSelectOption value="">No account</NativeSelectOption>
              {accounts.map(a => <NativeSelectOption key={a.id} value={a.id}>{a.name}</NativeSelectOption>)}
            </NativeSelect>
            {outstanding.length > 1 && (
              <Button variant="outline" className="h-12 shrink-0" disabled={busy} onClick={() => onSettle(outstanding.map(s => s.shareId), receiveInto)}>
                Mark all paid
              </Button>
            )}
          </div>
        </div>
      )}

      {outstanding.length > 0 && (
        <ul className="flex flex-col gap-2 pt-3">
          {outstanding.map(s => {
            const title = <>{s.description || 'Untitled'}, <span className="tabular-nums">{fmt(s.amount, s.currency)}</span></>
            const detail = `${formatDay(s.occurred_at, tz)}${s.paid > 0 ? `, ${fmt(s.paid, s.currency)} paid, ${fmt(s.amount - s.paid, s.currency)} left` : ''}${s.note ? `, ${s.note}` : ''}`
            return (
              <li key={s.shareId}>
                {canMarkPaid ? (
                  <AttentionRow
                    title={title}
                    detail={detail}
                    action={
                      <Button className="shrink-0" disabled={busy} onClick={() => onSettle([s.shareId], receiveInto)} aria-label={`Mark paid: ${s.description || 'entry'} ${fmt(s.amount, s.currency)}`}>
                        Mark paid
                      </Button>
                    }
                  />
                ) : (
                  <div className="flex min-h-[56px] flex-col justify-center gap-0.5 border-b border-border py-2">
                    <span className="text-[15px] font-medium">{title}</span>
                    <span className="text-[13px] text-muted-foreground">{detail}</span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {(owes.length > 0 || holds.length > 0) && !recording && (
        <Button id={recordOpenId} variant="outline" className="mt-3 self-start" onClick={openRecording}>
          {owes.length > 0 ? 'Record a payment' : 'Record money you gave back'}
        </Button>
      )}

      {recording && (owes.length > 0 || holds.length > 0) && (
        <RecordPayment
          person={person}
          direction={owes.length > 0 ? 'in' : 'out'}
          balances={owes.length > 0 ? owes : holds}
          legendId={legendId}
          entries={entries}
          accounts={accounts}
          defaultAccountId={defaultAccountId}
          tz={tz}
          busy={busy}
          onSave={choice => { onRecord(choice); closeRecording(true) }}
          onCancel={() => closeRecording(false)}
        />
      )}

      {history.length > 0 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className={cn('flex flex-col', (outstanding.length > 0 || owes.length > 0) && 'pt-2')}>
          <CollapsibleTrigger
            render={<Button variant="ghost" className="h-13 w-full justify-between rounded-none border-b border-b-border px-0 text-sm font-semibold text-muted-foreground hover:bg-transparent hover:text-foreground" />}
          >
            <span>History ({history.length})</span>
            <ChevronDown className={cn('size-4 transition-transform', historyOpen && 'rotate-180')} aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul>
              {history.map(h => {
                if (h.kind === 'share') {
                  const s = h.share
                  const e = entryById.get(s.money_entry_id)!
                  const acc = accounts.find(a => a.id === s.settled_account_id)
                  return (
                    <li key={s.id} className="flex min-h-[60px] items-center justify-between gap-3 border-b border-border py-2">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="truncate text-[15px] font-medium">{e.description || 'Untitled'}</div>
                        <div className="text-[13px] text-muted-foreground">Paid {s.settled_at ? formatDay(s.settled_at, tz) : ''}{acc ? ` into ${acc.name}` : ''}</div>
                      </div>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums text-muted-foreground">{fmt(s.amount, e.currency)}</span>
                      <Button variant="link" className="shrink-0 px-1" disabled={busy} onClick={() => onUnsettle(s.id)} aria-label={`Mark unpaid: ${e.description || 'entry'}`}>
                        Mark unpaid
                      </Button>
                    </li>
                  )
                }
                const e = h.entry
                const acc = accounts.find(a => a.id === e.account_id)
                const untag = !createdAsRepayment(e)
                const what = e.direction === 'in' ? `Paid you${e.merchant ? ` (${e.merchant})` : ''}` : 'You gave it back'
                return (
                  <li key={e.id} className="flex min-h-[60px] items-center justify-between gap-3 border-b border-border py-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="truncate text-[15px] font-medium">{what}</div>
                      <div className="text-[13px] text-muted-foreground">{formatDay(e.occurred_at, tz)}{acc ? `, ${e.direction === 'in' ? 'into' : 'from'} ${acc.name}` : ''}</div>
                    </div>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums text-muted-foreground">{e.direction === 'out' ? '−' : ''}{fmt(e.amount, e.currency)}</span>
                    <Button variant="link" className="shrink-0 px-1" disabled={busy} onClick={() => onRemoveRepayment(e)} aria-label={`${untag ? 'Not a repayment' : 'Remove'}: ${fmt(e.amount, e.currency)} on ${formatDay(e.occurred_at, tz)}`}>
                      {untag ? 'Not a repayment' : 'Remove'}
                    </Button>
                  </li>
                )
              })}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </section>
  )
}

const CASH = '__cash__'

/**
 * "Record a payment" (direction in): pick the money-in it arrived as (bank
 * credits that aren't tagged yet, the amount nearest what they owe first), or
 * record it as cash / not imported. Picking an existing credit can't count the
 * same money twice. "Record money you gave back" (direction out) records cash
 * or a transfer back to someone you hold money for; an imported debit is
 * matched in Needs you instead.
 */
function RecordPayment({ person, direction, balances, legendId, entries, accounts, defaultAccountId, tz, busy, onSave, onCancel }: {
  person: PersonRow
  direction: 'in' | 'out'
  /** What they owe you (in) or what you hold for them (out), per currency. */
  balances: [string, number][]
  legendId: string
  entries: MoneyEntryRow[]
  accounts: { id: string; name: string }[]
  defaultAccountId: string | null
  tz: string
  busy: boolean
  onSave: (choice: RecordChoice) => void
  onCancel: () => void
}) {
  const owes = balances
  const [currency, setCurrency] = useState(owes[0][0])
  const owedHere = owes.find(([c]) => c === currency)?.[1] ?? 0
  const candidates = useMemo(
    () => direction === 'in' ? repaymentCandidates(entries, currency, owedHere, new Date().toISOString()) : [],
    [direction, entries, currency, owedHere],
  )
  const [pickId, setPickId] = useState(direction === 'out' ? CASH : '')
  const [amountText, setAmountText] = useState(() => amountInputText(owes[0][1], owes[0][0]))
  const [accountId, setAccountId] = useState<string | null>(defaultAccountId)

  // Typed amounts follow the chip's convention (×100), except JPY (whole yen).
  const typed = parseAmountInput(amountText)
  const cashAmount = typed === null ? 0 : currency === 'JPY' ? Math.round(typed / 100) : typed
  const picked = candidates.find(c => c.id === pickId)
  const choice: RecordChoice | null =
    picked ? { kind: 'existing', entryId: picked.id, amount: picked.amount, currency }
    : pickId === CASH && cashAmount > 0 ? { kind: 'cash', direction, amount: cashAmount, currency, accountId }
    : null

  return (
    <FieldSet className="min-w-0 gap-0 pt-4">
      <FieldLegend id={legendId} tabIndex={-1} className="mb-0 w-full border-b border-border pb-2.5 text-[15px] font-semibold outline-none">
        {direction === 'in' ? `How did ${person.name} pay you?` : `Money you gave back to ${person.name}`}
      </FieldLegend>
      {owes.length > 1 && (
        <NativeSelect
          value={currency}
          onChange={e => { const c = e.target.value; setCurrency(c); setPickId(''); setAmountText(amountInputText(owes.find(([x]) => x === c)?.[1] ?? 0, c)) }}
          aria-label="Currency"
          className={cn(SELECT_CLASS, 'my-2 min-w-0')}
        >
          {owes.map(([c]) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
        </NativeSelect>
      )}
      <RadioGroup aria-labelledby={legendId} value={pickId} onValueChange={v => setPickId(String(v))} className="gap-0">
        {candidates.map(c => {
          const acc = accounts.find(a => a.id === c.account_id)
          return (
            <Label key={c.id} className={cn('min-h-14 gap-3 border-b border-border px-1 text-[15px] tracking-normal text-foreground', pickId === c.id ? 'font-semibold' : 'font-medium')}>
              <RadioGroupItem value={c.id} className="size-5 border-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{c.merchant || c.description || 'Money in'}</span>
                <span className="text-[13px] font-normal text-muted-foreground">{formatDay(c.occurred_at, tz)}{acc ? `, into ${acc.name}` : ''}</span>
              </span>
              <span className="shrink-0 tabular-nums text-income">+{fmt(c.amount, c.currency)}</span>
            </Label>
          )
        })}
        <Label className={cn('min-h-14 gap-3 border-b border-border px-1 text-[15px] tracking-normal text-foreground', pickId === CASH ? 'font-semibold' : 'font-medium')}>
          <RadioGroupItem value={CASH} className="size-5 border-muted-foreground" />
          {candidates.length > 0 ? 'Cash, or it’s not listed' : 'Cash, or it hasn’t come in from the bank yet'}
        </Label>
      </RadioGroup>
      {pickId === CASH && (
        <div className="flex flex-col gap-3 pt-3">
          <div className="flex items-center gap-3">
            <Label htmlFor={`record-amount-${person.id}`} className="text-[15px] font-medium tracking-normal">Amount ({currency})</Label>
            <Input id={`record-amount-${person.id}`} inputMode="decimal" value={amountText} onChange={e => setAmountText(e.currentTarget.value)} className="w-28 px-3 text-right" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`record-account-${person.id}`} className={LABEL_CLASS}>Into</Label>
            <NativeSelect id={`record-account-${person.id}`} value={accountId ?? ''} onChange={e => setAccountId(e.target.value || null)} className={cn(SELECT_CLASS, 'min-w-0')}>
              <NativeSelectOption value="">No account</NativeSelectOption>
              {accounts.map(a => <NativeSelectOption key={a.id} value={a.id}>{a.name}</NativeSelectOption>)}
            </NativeSelect>
          </div>
          <p className="text-[13px] text-muted-foreground">For money no bank alert will show. If an alert for it does arrive later, mark that one as theirs in Needs you and remove this one here, so it isn’t counted twice.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-4">
        <Button disabled={busy || !choice} onClick={() => choice && onSave(choice)}>Save payment</Button>
        <Button variant="link" className="px-0" onClick={onCancel}>Cancel</Button>
      </div>
    </FieldSet>
  )
}
