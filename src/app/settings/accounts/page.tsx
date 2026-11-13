'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Star } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { useAccounts } from '@/hooks/use-accounts'
import { useArchivedAccounts } from '@/hooks/use-archived-accounts'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { planAccountBackfill } from '@/lib/account-match'
import { tagEntries } from '@/lib/account-autotag'
import { defaultToggleUpdates, pickDefaultAccountId } from '@/lib/default-account'
import { parseAmountInput } from '@/lib/parse-amount'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuroraBackground } from '@/components/aurora-background'
import { db, type AccountRow } from '@/lib/dexie'

export default function AccountsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [newType, setNewType] = useState<'asset' | 'liability'>('asset')
  const [newOpeningBalance, setNewOpeningBalance] = useState('')
  const [newCurrency, setNewCurrency] = useState<typeof SUPPORTED_CURRENCIES[number]>('INR')
  const [matchHints, setMatchHints] = useState('')

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  const accounts = useAccounts(userId ?? undefined)
  const archived = useArchivedAccounts(userId ?? undefined)
  const entries = useMoneyEntries(userId ?? undefined)
  const defaultId = useMemo(() => pickDefaultAccountId(accounts), [accounts])
  const backfill = useMemo(() => planAccountBackfill(entries, accounts), [entries, accounts])
  const [tagged, setTagged] = useState<number | null>(null)
  const [tagging, setTagging] = useState(false)

  async function toggleDefault(id: string) {
    if (!userId) return
    for (const u of defaultToggleUpdates([...accounts, ...archived], id)) {
      await applyLocalOp(await generateOp({
        entity_kind: 'account', entity_id: u.id, op_type: 'update',
        payload: { is_default: u.is_default }, user_id: userId,
      }))
    }
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function runBackfill() {
    if (!userId || tagging) return
    setTagging(true)
    try {
      // Pull first and re-plan from a fresh read: this page doesn't sync on its
      // own, and a tag op on an entry deleted/re-tagged elsewhere would undo that.
      await pushPullOnce({ userId }).catch(err => console.error('sync', err))
      const fresh = await db.money_entries.where('user_id').equals(userId).toArray()
      setTagged(await tagEntries(userId, planAccountBackfill(fresh, accounts)))
    } finally { setTagging(false) }
  }

  async function addAccount() {
    if (!userId || !newName.trim() || !newOpeningBalance.trim()) return
    const openingBalanceMinor = parseAmountInput(newOpeningBalance)
    if (openingBalanceMinor === null) return

    const op = await generateOp({
      entity_kind: 'account',
      entity_id: crypto.randomUUID(),
      op_type: 'create',
      payload: {
        name: newName.trim(),
        type: newType,
        opening_balance: openingBalanceMinor,
        currency: newCurrency,
        icon: newIcon.trim() || null,
        match_hints: matchHints.trim() || null,
      },
      user_id: userId,
    })
    await applyLocalOp(op)
    setNewName('')
    setNewIcon('')
    setNewOpeningBalance('')
    setNewType('asset')
    setNewCurrency('INR')
    setMatchHints('')
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function updateAccount(id: string, payload: Record<string, string | number | null>) {
    if (!userId) return
    const op = await generateOp({
      entity_kind: 'account',
      entity_id: id,
      op_type: 'update',
      payload,
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function archiveAccount(id: string) {
    await updateAccount(id, { is_archived: 1 })
  }

  async function restoreAccount(id: string) {
    await updateAccount(id, { is_archived: 0 })
  }

  if (!userId) return <p className="p-8">Loading…</p>

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex w-full max-w-md md:max-w-3xl flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Accounts</h1>
          <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
        </header>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Name…"
                maxLength={40}
                aria-label="Account name"
              />
              <Input
                value={newIcon}
                onChange={e => setNewIcon(e.target.value)}
                placeholder="Emoji"
                maxLength={8}
                className="w-20 text-center"
                aria-label="Account icon"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={newType}
                onChange={e => setNewType(e.target.value as 'asset' | 'liability')}
                className="glass-soft rounded-lg border border-input px-2 text-sm transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-accent-2"
                aria-label="Account type"
              >
                <option value="asset">Asset</option>
                <option value="liability">Liability</option>
              </select>
              <select
                value={newCurrency}
                onChange={e => setNewCurrency(e.target.value as typeof SUPPORTED_CURRENCIES[number])}
                className="glass-soft rounded-lg border border-input px-2 text-sm transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-accent-2"
                aria-label="Currency"
              >
                {SUPPORTED_CURRENCIES.map(curr => (
                  <option key={curr} value={curr}>{curr}</option>
                ))}
              </select>
            </div>
            <Input
              value={matchHints}
              onChange={e => setMatchHints(e.target.value)}
              placeholder="Auto-match hints, e.g. 5678, hdfc credit"
              maxLength={200}
              aria-label="Auto-match hints"
            />
            <p className="text-xs text-muted-foreground">
              A card/account last-4 in the name (e.g. “Tata Neo 5872”) is matched automatically — hints are only needed for extra numbers, like a debit card’s last-4 on a bank account.
            </p>
            <div className="flex gap-2">
              <Input
                value={newOpeningBalance}
                onChange={e => setNewOpeningBalance(e.target.value)}
                placeholder="Opening balance…"
                type="text"
                inputMode="decimal"
                aria-label="Opening balance"
              />
              <Button onClick={addAccount} className="flex-1">Add</Button>
            </div>
          </div>
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Active Accounts</h2>
          <ul className="glass-soft divide-y divide-white/10 rounded-lg border border-white/10">
            {accounts.length === 0 && <li className="p-3 text-sm text-muted-foreground">Add your first account.</li>}
            {accounts.map(a => (
              <AccountRow
                key={a.id}
                account={a}
                isDefault={a.id === defaultId}
                onToggleDefault={toggleDefault}
                onArchive={archiveAccount}
                onUpdate={updateAccount}
              />
            ))}
          </ul>
          {accounts.length > 0 && (
            <p className="text-xs text-muted-foreground">★ marks the default account, pre-selected when you add an entry by hand, voice or receipt.</p>
          )}
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Past alerts</h2>
          {backfill.length > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-sm">
                {backfill.length} past SMS/email {backfill.length === 1 ? 'entry matches' : 'entries match'} your accounts but {backfill.length === 1 ? 'has' : 'have'} no account yet.
              </p>
              <Button size="sm" onClick={runBackfill} disabled={tagging} style={{ minHeight: '44px' }}>
                {tagging ? 'Tagging…' : `Tag ${backfill.length}`}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No untagged past alerts match your accounts.</p>
          )}
          <p role="status" className="text-sm text-muted-foreground empty:hidden">
            {tagged ? `Tagged ${tagged} past ${tagged === 1 ? 'entry' : 'entries'}.` : ''}
          </p>
        </section>

        {archived.length > 0 && (
          <ArchivedSection archived={archived} onRestore={restoreAccount} />
        )}
      </main>
    </>
  )
}

function AccountRow({
  account,
  isDefault,
  onToggleDefault,
  onArchive,
  onUpdate,
}: {
  account: AccountRow
  isDefault: boolean
  onToggleDefault: (id: string) => void
  onArchive: (id: string) => void
  onUpdate: (id: string, payload: Record<string, string | number | null>) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editOpeningBalance, setEditOpeningBalance] = useState('')
  const [editMatchHints, setEditMatchHints] = useState('')

  const divisor = account.currency === 'JPY' ? 1 : 100

  function startEdit(a: AccountRow) {
    setEditingId(a.id)
    setEditName(a.name)
    setEditIcon(a.icon ?? '')
    setEditOpeningBalance((a.opening_balance / divisor).toLocaleString(undefined, { maximumFractionDigits: 2 }))
    setEditMatchHints(a.match_hints ?? '')
  }

  async function saveEdit(id: string) {
    const trimmed = editName.trim()
    if (!trimmed || !editOpeningBalance.trim()) return
    const openingBalanceMinor = parseAmountInput(editOpeningBalance)
    if (openingBalanceMinor === null) return
    await onUpdate(id, {
      name: trimmed,
      icon: editIcon.trim() || null,
      opening_balance: openingBalanceMinor,
      match_hints: editMatchHints.trim() || null,
    })
    setEditingId(null)
  }

  if (editingId === account.id) {
    return (
      <li className="flex flex-col gap-2 py-3 px-3">
        <div className="flex gap-2">
          <Input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            placeholder="Name…"
            maxLength={40}
            autoFocus
            className="flex-1"
            aria-label="Edit account name"
          />
          <Input
            value={editIcon}
            onChange={e => setEditIcon(e.target.value)}
            placeholder="Emoji"
            maxLength={8}
            className="w-20 text-center"
            aria-label="Edit account icon"
          />
        </div>
        <Input
          value={editOpeningBalance}
          onChange={e => setEditOpeningBalance(e.target.value)}
          placeholder="Opening balance…"
          type="text"
          inputMode="decimal"
          aria-label="Edit opening balance"
        />
        <Input
          value={editMatchHints}
          onChange={e => setEditMatchHints(e.target.value)}
          placeholder="Auto-match hints, e.g. 5678, hdfc credit"
          maxLength={200}
          aria-label="Auto-match hints"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => saveEdit(account.id)}
            className="flex-1"
            style={{ minHeight: '44px' }}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditingId(null)}
            className="flex-1"
            style={{ minHeight: '44px' }}
          >
            Cancel
          </Button>
        </div>
      </li>
    )
  }

  return (
    <li className="flex flex-col gap-1 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 break-words text-sm">
          {account.icon && <span className="mr-1">{account.icon}</span>}
          {account.name} ({account.type}) · {account.currency} {(account.opening_balance / divisor).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
        <div className="flex shrink-0 gap-1 sm:gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onToggleDefault(account.id)}
            style={{ height: '44px', minWidth: '44px' }}
            aria-pressed={isDefault}
            aria-label={`Default account: ${account.name}`}
            title={isDefault ? 'Default account' : 'Make default'}
          >
            <Star className={isDefault ? 'h-4 w-4 fill-accent-2 text-accent-2' : 'h-4 w-4 text-muted-foreground'} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => startEdit(account)}
            style={{ height: '44px', minWidth: '44px' }}
            aria-label={`Edit ${account.name}`}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onArchive(account.id)}
            style={{ height: '44px', minWidth: '44px' }}
            aria-label={`Archive ${account.name}`}
          >
            Archive
          </Button>
        </div>
      </div>
      {account.match_hints && (
        <span className="text-xs text-muted-foreground">matches: {account.match_hints}</span>
      )}
    </li>
  )
}

function ArchivedSection({
  archived,
  onRestore,
}: {
  archived: ReturnType<typeof useArchivedAccounts>
  onRestore: (id: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <section className="glass flex flex-col gap-2 rounded-2xl p-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between text-left text-sm font-semibold uppercase text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>Archived ({archived.length})</span>
        <span>{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && (
        <ul className="glass-soft divide-y divide-white/10 rounded-lg border border-white/10">
          {archived.map(a => (
            <li key={a.id} className="flex items-center justify-between p-3">
              <span className="text-sm">
                {a.icon && <span className="mr-1">{a.icon}</span>}
                {a.name} ({a.type})
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRestore(a.id)}
                style={{ height: '44px', minWidth: '44px' }}
                aria-label={`Restore ${a.name}`}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
