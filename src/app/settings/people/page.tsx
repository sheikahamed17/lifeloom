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
import { owedByPerson, owedTotal } from '@/lib/shares'
import { pickDefaultAccountId } from '@/lib/default-account'
import { convertViaRates } from '@/lib/fx'
import { formatMinor } from '@/lib/currency'
import { formatDay } from '@/lib/format'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageShell } from '@/components/page-shell'
import { RowMenu } from '@/components/row-menu'
import { FIELD_SELECT } from '@/components/sort-control'
import { UndoProvider, useUndo } from '@/components/undo-provider'
import type { ExpenseShareRow, MoneyEntryRow, PersonRow } from '@/lib/dexie'

const fmt = formatMinor
const BACK = { href: '/settings', label: 'Settings' }

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
  const showTotal = owed.length > 1

  // Jump to the person a money-row pill linked to (#<personId>).
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return
    const id = window.location.hash.slice(1)
    if (!id) return
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ block: 'start' })
  }, [userId])

  async function op(entity_kind: 'person' | 'expense_share', entity_id: string, op_type: 'create' | 'update' | 'delete', payload: Record<string, unknown>) {
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

  async function rename(id: string, name: string) { await op('person', id, 'update', { name }); sync() }
  async function archive(id: string, archived: boolean) {
    await op('person', id, 'update', { is_archived: archived ? 1 : 0 })
    sync()
    if (archived) undo.push(`Archived ${live.find(p => p.id === id)?.name ?? 'person'}`, () => archive(id, false))
  }

  if (!userId) {
    return (
      <PageShell title="People" back={BACK}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PageShell>
    )
  }

  return (
    <PageShell title="People" back={BACK}>
      <section className="glass flex flex-col gap-3 rounded-2xl p-4">
        {showTotal && (
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Owed to you</h2>
            <span className="font-mono text-2xl font-semibold tabular-nums">{fmt(headline.total, prefs.primary_currency)}</span>
          </div>
        )}
        {showTotal && headline.skipped.length > 0 && (
          <p className="text-xs text-muted-foreground">Not converted (no exchange rate yet): {headline.skipped.join(', ')}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Share an expense from the capture chip (“Share with…”). When someone pays you back, mark it paid here: the money returns to the account you pick, and nothing is counted as income.
        </p>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPerson() } }}
            placeholder="Add a person…"
            maxLength={60}
            aria-label="New person name"
          />
          <Button onClick={addPerson} disabled={!newName.trim()}>Add</Button>
        </div>
      </section>

      {active.length === 0 && (
        <p className="text-sm text-muted-foreground">No people yet. Add someone above, or share an expense from the capture chip.</p>
      )}

      {active.map(p => (
        <PersonCard
          key={p.id}
          person={p}
          owed={owedFor.get(p.id)}
          shares={shares.filter(s => s.person_id === p.id)}
          entryById={entryById}
          accounts={accounts}
          defaultAccountId={defaultAccountId}
          tz={prefs.tz}
          busy={busy}
          onSettle={settle}
          onUnsettle={unsettle}
          onRename={rename}
          onArchive={id => archive(id, true)}
        />
      ))}

      {archived.length > 0 && (
        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">Archived ({archived.length})</h2>
          <ul className="glass-soft divide-y divide-white/10 rounded-lg">
            {archived.map(p => (
              <li key={p.id} id={p.id} className="flex items-center justify-between gap-2 py-2 pl-3 pr-1 text-sm">
                <span className="min-w-0">{p.name}{owedFor.get(p.id) ? ` · still owes ${Object.entries(owedFor.get(p.id)!.byCurrency).map(([c, a]) => fmt(a, c)).join(', ')}` : ''}</span>
                <Button variant="ghost" onClick={() => archive(p.id, false)} aria-label={`Restore ${p.name}`}>Restore</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  )
}

function PersonCard({
  person, owed, shares, entryById, accounts, defaultAccountId, tz, busy, onSettle, onUnsettle, onRename, onArchive,
}: {
  person: PersonRow
  busy: boolean
  owed: ReturnType<typeof owedByPerson>[number] | undefined
  shares: ExpenseShareRow[]
  entryById: Map<string, MoneyEntryRow>
  accounts: { id: string; name: string; icon: string | null }[]
  defaultAccountId: string | null
  tz: string
  onSettle: (shareIds: string[], accountId: string | null) => void
  onUnsettle: (shareId: string) => void
  onRename: (id: string, name: string) => void
  onArchive: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(person.name)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [accountTouched, setAccountTouched] = useState(false)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const receiveInto = accountTouched ? accountId : defaultAccountId

  const settled = useMemo(
    () => shares
      .filter(s => s.settled_at && entryById.get(s.money_entry_id) && !entryById.get(s.money_entry_id)!.deleted_at)
      .sort((a, b) => (b.settled_at ?? '').localeCompare(a.settled_at ?? '')),
    [shares, entryById],
  )
  const outstanding = owed?.shares ?? []

  return (
    <section id={person.id} className="glass flex flex-col gap-3 rounded-2xl p-4 scroll-mt-4">
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <div className="flex flex-1 gap-2">
            <Input value={name} onChange={e => setName(e.target.value)} maxLength={60} autoFocus aria-label={`Rename ${person.name}`} />
            <Button onClick={() => { const n = name.trim(); if (n && n !== person.name) onRename(person.id, n); setEditing(false) }}>Save</Button>
            <Button variant="outline" onClick={() => { setName(person.name); setEditing(false) }}>Cancel</Button>
          </div>
        ) : (
          <>
            <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{person.name}</h2>
            {/* A person's total only when it sums more than one row; one row already says it. */}
            {owed && outstanding.length > 1 && (
              <span className="whitespace-nowrap text-sm text-muted-foreground">
                owes <span className="font-mono tabular-nums text-foreground">{Object.entries(owed.byCurrency).map(([c, a]) => fmt(a, c)).join(' + ')}</span>
              </span>
            )}
            {!owed && <span className="text-sm text-muted-foreground">Settled up</span>}
            <RowMenu
              label={`Actions for ${person.name}`}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              items={[
                { label: 'Rename', icon: Pencil, onSelect: () => setEditing(true) },
                { label: 'Archive', icon: Archive, onSelect: () => onArchive(person.id) },
              ]}
            />
          </>
        )}
      </div>

      {outstanding.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor={`receive-${person.id}`}>Paid into</label>
            <select
              id={`receive-${person.id}`}
              value={receiveInto ?? ''}
              onChange={e => { setAccountTouched(true); setAccountId(e.target.value || null) }}
              className={cn(FIELD_SELECT, 'w-auto min-w-0 flex-1 sm:flex-none')}
            >
              <option value="">No account</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.icon ? `${a.icon} ${a.name}` : a.name}</option>)}
            </select>
            {outstanding.length > 1 && (
              <Button variant="outline" className="ml-auto" disabled={busy} onClick={() => onSettle(outstanding.map(s => s.shareId), receiveInto)}>
                Mark all paid
              </Button>
            )}
          </div>
          <ul className="glass-soft divide-y divide-white/10 rounded-lg">
            {outstanding.map(s => (
              <li key={s.shareId} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{s.description || 'Untitled'}</div>
                  <div className="text-xs text-muted-foreground">{formatDay(s.occurred_at, tz)}{s.note ? ` · ${s.note}` : ''}</div>
                </div>
                <span className="font-mono tabular-nums">{fmt(s.amount, s.currency)}</span>
                <Button disabled={busy} onClick={() => onSettle([s.shareId], receiveInto)} aria-label={`Mark paid: ${s.description || 'entry'} ${fmt(s.amount, s.currency)}`}>
                  Mark paid
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      {settled.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setHistoryOpen(o => !o)}
            className="-mx-2 flex min-h-11 items-center justify-between rounded-lg px-2 text-left text-sm font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2"
            aria-expanded={historyOpen}
          >
            <span>Paid ({settled.length})</span>
            <ChevronDown className={cn('size-4 transition-transform', historyOpen && 'rotate-180')} aria-hidden />
          </button>
          {historyOpen && (
            <ul className="glass-soft divide-y divide-white/10 rounded-lg">
              {settled.map(s => {
                const e = entryById.get(s.money_entry_id)!
                const acc = accounts.find(a => a.id === s.settled_account_id)
                return (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2 pl-3 pr-1 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{e.description || 'Untitled'}</div>
                      <div className="text-xs text-muted-foreground">Paid {s.settled_at ? formatDay(s.settled_at, tz) : ''}{acc ? ` into ${acc.name}` : ''}</div>
                    </div>
                    <span className="font-mono tabular-nums text-muted-foreground">{fmt(s.amount, e.currency)}</span>
                    <Button variant="ghost" disabled={busy} onClick={() => onUnsettle(s.id)} aria-label={`Mark unpaid: ${e.description || 'entry'}`}>
                      Mark unpaid
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
