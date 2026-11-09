'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuroraBackground } from '@/components/aurora-background'
import type { ExpenseShareRow, MoneyEntryRow, PersonRow } from '@/lib/dexie'

const fmt = formatMinor

export default function PeoplePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ text: string; undo?: () => Promise<void> } | null>(null)

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
      setStatus({
        text: `Marked ${fmt(total, currency)} paid${acc ? ` into ${acc.name}` : ''}.`,
        undo: async () => { for (const id of shareIds) await op('expense_share', id, 'update', { settled_at: null, settled_account_id: null }); setStatus({ text: 'Undone.' }); sync() },
      })
      sync()
    } finally { setBusy(false) }
  }

  async function unsettle(shareId: string) {
    if (busy) return
    setBusy(true)
    try {
      await op('expense_share', shareId, 'update', { settled_at: null, settled_account_id: null })
      setStatus({ text: 'Marked as still owed.' })
      sync()
    } finally { setBusy(false) }
  }

  async function rename(id: string, name: string) { await op('person', id, 'update', { name }); sync() }
  async function archive(id: string, archived: boolean) { await op('person', id, 'update', { is_archived: archived ? 1 : 0 }); sync() }

  if (!userId) return <p className="p-8">Loading…</p>

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex w-full max-w-md md:max-w-3xl flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">People</h1>
          <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
        </header>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Owed to you</span>
            <span className="font-mono text-2xl font-semibold tabular-nums">{fmt(headline.total, prefs.primary_currency)}</span>
          </div>
          {headline.skipped.length > 0 && (
            <p className="text-xs text-muted-foreground">Not converted (no FX rate yet): {headline.skipped.join(', ')}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Share an expense from the capture chip (“Share with…”). When someone pays you back, mark it paid here: the money returns to the account you pick, and nothing is counted as income.
          </p>
          <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground empty:hidden">
            {status?.text}
            {status?.undo && (
              <button type="button" onClick={() => status.undo?.()} className="min-h-[44px] px-2 text-accent-2 hover:underline focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded">Undo</button>
            )}
          </p>
          <div className="mt-1 flex gap-2">
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
            busy={busy}
            onSettle={settle}
            onUnsettle={unsettle}
            onRename={rename}
            onArchive={id => archive(id, true)}
          />
        ))}

        {archived.length > 0 && (
          <section className="glass flex flex-col gap-2 rounded-2xl p-4">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">Archived ({archived.length})</h2>
            <ul className="glass-soft divide-y divide-white/10 rounded-lg border border-white/10">
              {archived.map(p => (
                <li key={p.id} id={p.id} className="flex items-center justify-between p-3 text-sm">
                  <span>{p.name}{owedFor.get(p.id) ? ` · still owes ${Object.entries(owedFor.get(p.id)!.byCurrency).map(([c, a]) => fmt(a, c)).join(', ')}` : ''}</span>
                  <Button size="sm" variant="ghost" onClick={() => archive(p.id, false)} style={{ height: '44px' }} aria-label={`Restore ${p.name}`}>Restore</Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  )
}

function PersonCard({
  person, owed, shares, entryById, accounts, defaultAccountId, busy, onSettle, onUnsettle, onRename, onArchive,
}: {
  person: PersonRow
  busy: boolean
  owed: ReturnType<typeof owedByPerson>[number] | undefined
  shares: ExpenseShareRow[]
  entryById: Map<string, MoneyEntryRow>
  accounts: { id: string; name: string; icon: string | null }[]
  defaultAccountId: string | null
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editing ? (
          <div className="flex flex-1 gap-2">
            <Input value={name} onChange={e => setName(e.target.value)} maxLength={60} autoFocus aria-label={`Rename ${person.name}`} />
            <Button size="sm" onClick={() => { const n = name.trim(); if (n && n !== person.name) onRename(person.id, n); setEditing(false) }} style={{ minHeight: '44px' }}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setName(person.name); setEditing(false) }} style={{ minHeight: '44px' }}>Cancel</Button>
          </div>
        ) : (
          <>
            <h2 className="min-w-0 flex-1 basis-full sm:basis-auto truncate text-lg font-semibold">{person.name}</h2>
            <span className="font-mono tabular-nums text-sm whitespace-nowrap">
              {owed ? Object.entries(owed.byCurrency).map(([c, a]) => fmt(a, c)).join(' + ') : <span className="text-muted-foreground">settled up</span>}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} style={{ height: '44px', minWidth: '44px' }} aria-label={`Rename ${person.name}`}>Rename</Button>
            <Button size="sm" variant="ghost" onClick={() => onArchive(person.id)} style={{ height: '44px', minWidth: '44px' }} aria-label={`Archive ${person.name}`}>Archive</Button>
          </>
        )}
      </div>

      {outstanding.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="text-muted-foreground" htmlFor={`receive-${person.id}`}>Paid into</label>
            <select
              id={`receive-${person.id}`}
              value={receiveInto ?? ''}
              onChange={e => { setAccountTouched(true); setAccountId(e.target.value || null) }}
              className="rounded-md border bg-muted px-2 py-1 text-base md:text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
            >
              <option value="">No account</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.icon ? `${a.icon} ${a.name}` : a.name}</option>)}
            </select>
            {outstanding.length > 1 && (
              <Button size="sm" variant="outline" className="ml-auto" style={{ minHeight: '44px' }} disabled={busy} onClick={() => onSettle(outstanding.map(s => s.shareId), receiveInto)}>
                Mark all paid
              </Button>
            )}
          </div>
          <ul className="glass-soft divide-y divide-white/10 rounded-lg border border-white/10">
            {outstanding.map(s => (
              <li key={s.shareId} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{s.description || 'Untitled'}</div>
                  <div className="text-xs text-muted-foreground">{s.occurred_at.slice(0, 10)}{s.note ? ` · ${s.note}` : ''}</div>
                </div>
                <span className="font-mono tabular-nums">{fmt(s.amount, s.currency)}</span>
                <Button size="sm" disabled={busy} onClick={() => onSettle([s.shareId], receiveInto)} style={{ minHeight: '44px' }} aria-label={`Mark paid: ${s.description || 'entry'} ${fmt(s.amount, s.currency)}`}>
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
            className="flex min-h-[44px] items-center justify-between text-left text-xs font-semibold uppercase text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
            aria-expanded={historyOpen}
          >
            <span>Paid ({settled.length})</span>
            <span aria-hidden="true">{historyOpen ? '−' : '+'}</span>
          </button>
          {historyOpen && (
            <ul className="glass-soft divide-y divide-white/10 rounded-lg border border-white/10">
              {settled.map(s => {
                const e = entryById.get(s.money_entry_id)!
                const acc = accounts.find(a => a.id === s.settled_account_id)
                return (
                  <li key={s.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{e.description || 'Untitled'}</div>
                      <div className="text-xs text-muted-foreground">paid {s.settled_at?.slice(0, 10)}{acc ? ` into ${acc.name}` : ''}</div>
                    </div>
                    <span className="font-mono tabular-nums text-muted-foreground">{fmt(s.amount, e.currency)}</span>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => onUnsettle(s.id)} style={{ minHeight: '44px' }} aria-label={`Unsettle: ${e.description || 'entry'}`}>
                      Unsettle
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
