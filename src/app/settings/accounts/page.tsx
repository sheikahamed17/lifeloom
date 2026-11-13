'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ChevronDown, Pencil, Star } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { useAccounts } from '@/hooks/use-accounts'
import { useArchivedAccounts } from '@/hooks/use-archived-accounts'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { planAccountBackfill } from '@/lib/account-match'
import { tagEntries } from '@/lib/account-autotag'
import { defaultToggleUpdates, pickDefaultAccountId } from '@/lib/default-account'
import { parseAmountInput } from '@/lib/parse-amount'
import { formatMinor } from '@/lib/currency'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageShell } from '@/components/page-shell'
import { RowMenu } from '@/components/row-menu'
import { FIELD_SELECT } from '@/components/sort-control'
import { UndoProvider, useUndo } from '@/components/undo-provider'
import { db, type AccountRow } from '@/lib/dexie'

const BACK = { href: '/settings', label: 'Settings' }

/** Plain words for the account type: no "asset"/"liability" in the UI. */
const TYPE_WORD: Record<AccountRow['type'], string> = { asset: 'Bank or cash', liability: 'Card or loan' }

export default function AccountsPage() {
  return (
    <UndoProvider>
      <AccountsPageInner />
    </UndoProvider>
  )
}

function AccountsPageInner() {
  const router = useRouter()
  const undo = useUndo()
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
    const name = accounts.find(a => a.id === id)?.name
    await updateAccount(id, { is_archived: 1 })
    undo.push(`Archived ${name ?? 'account'}`, () => restoreAccount(id))
  }

  async function restoreAccount(id: string) {
    await updateAccount(id, { is_archived: 0 })
  }

  if (!userId) {
    return (
      <PageShell title="Accounts" back={BACK}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PageShell>
    )
  }

  return (
    <PageShell title="Accounts" back={BACK}>
      <section className="glass flex flex-col gap-3 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Add an account</h2>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Name"
            maxLength={40}
            aria-label="Account name"
          />
          <Input
            value={newIcon}
            onChange={e => setNewIcon(e.target.value)}
            placeholder="Emoji"
            maxLength={8}
            className="w-20 text-center"
            aria-label="Account emoji"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={newType}
            onChange={e => setNewType(e.target.value as 'asset' | 'liability')}
            className={cn(FIELD_SELECT, 'flex-1')}
            aria-label="Account type"
          >
            <option value="asset">{TYPE_WORD.asset}</option>
            <option value="liability">{TYPE_WORD.liability}</option>
          </select>
          <select
            value={newCurrency}
            onChange={e => setNewCurrency(e.target.value as typeof SUPPORTED_CURRENCIES[number])}
            className={cn(FIELD_SELECT, 'w-auto')}
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
          The last four digits in the name (e.g. “Tata Neo 5872”) are matched automatically. Add hints only for extra numbers, like a debit card’s last four on a bank account.
        </p>
        <div className="flex gap-2">
          <Input
            value={newOpeningBalance}
            onChange={e => setNewOpeningBalance(e.target.value)}
            placeholder="Opening balance"
            type="text"
            inputMode="decimal"
            aria-label="Opening balance"
          />
          <Button onClick={addAccount} className="flex-1">Add</Button>
        </div>
      </section>

      <section className="glass flex flex-col gap-2 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Active accounts</h2>
        <ul className="glass-soft divide-y divide-white/10 rounded-lg">
          {accounts.length === 0 && <li className="p-3 text-sm text-muted-foreground">Add your first account.</li>}
          {accounts.map(a => (
            <AccountRowItem
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
          <p className="text-xs text-muted-foreground">
            <Star className="mr-1 inline size-3.5 fill-accent-2 align-[-2px] text-accent-2" aria-hidden />
            The starred account is picked for you when you add an entry by hand, voice or receipt.
          </p>
        )}
      </section>

      <section className="glass flex flex-col gap-2 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Past alerts</h2>
        {backfill.length > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-sm">
              {backfill.length} past SMS or email {backfill.length === 1 ? 'entry matches' : 'entries match'} your accounts but {backfill.length === 1 ? 'has' : 'have'} no account yet.
            </p>
            <Button onClick={runBackfill} disabled={tagging}>
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
    </PageShell>
  )
}

function AccountRowItem({
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
  const [menuOpen, setMenuOpen] = useState(false)

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
      <li className="flex flex-col gap-2 p-3">
        <div className="flex gap-2">
          <Input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            placeholder="Name"
            maxLength={40}
            autoFocus
            className="flex-1"
            aria-label="Account name"
          />
          <Input
            value={editIcon}
            onChange={e => setEditIcon(e.target.value)}
            placeholder="Emoji"
            maxLength={8}
            className="w-20 text-center"
            aria-label="Account emoji"
          />
        </div>
        <Input
          value={editOpeningBalance}
          onChange={e => setEditOpeningBalance(e.target.value)}
          placeholder="Opening balance"
          type="text"
          inputMode="decimal"
          aria-label="Opening balance"
        />
        <Input
          value={editMatchHints}
          onChange={e => setEditMatchHints(e.target.value)}
          placeholder="Auto-match hints, e.g. 5678, hdfc credit"
          maxLength={200}
          aria-label="Auto-match hints"
        />
        <div className="flex gap-2">
          <Button onClick={() => saveEdit(account.id)} className="flex-1">Save</Button>
          <Button variant="outline" onClick={() => setEditingId(null)} className="flex-1">Cancel</Button>
        </div>
      </li>
    )
  }

  // One line for name + figure, one muted line for what the figure is; actions stay compact.
  const meta = [TYPE_WORD[account.type], 'opening balance', account.match_hints ? `matches ${account.match_hints}` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <li className="flex items-center gap-1 py-2 pl-3 pr-1">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium">
            {account.icon && <span aria-hidden="true" className="mr-1.5">{account.icon}</span>}
            {account.name}
          </span>
          <span className="shrink-0 font-mono text-sm tabular-nums">{formatMinor(account.opening_balance, account.currency)}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-lg"
        onClick={() => onToggleDefault(account.id)}
        aria-pressed={isDefault}
        aria-label={`Default account: ${account.name}`}
        title={isDefault ? 'Default account' : 'Make default'}
      >
        <Star className={isDefault ? 'size-4 fill-accent-2 text-accent-2' : 'size-4 text-muted-foreground'} aria-hidden />
      </Button>
      <RowMenu
        label={`Actions for ${account.name}`}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        items={[
          { label: 'Edit', icon: Pencil, onSelect: () => startEdit(account) },
          { label: 'Archive', icon: Archive, onSelect: () => onArchive(account.id) },
        ]}
      />
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
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="-mx-2 flex min-h-11 items-center justify-between rounded-lg px-2 text-left text-sm font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2"
      >
        <span>Archived ({archived.length})</span>
        <ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} aria-hidden />
      </button>
      {isOpen && (
        <ul className="glass-soft divide-y divide-white/10 rounded-lg">
          {archived.map(a => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2 pl-3 pr-1">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {a.icon && <span aria-hidden="true" className="mr-1.5">{a.icon}</span>}
                  {a.name}
                </p>
                <p className="text-xs text-muted-foreground">{TYPE_WORD[a.type]}</p>
              </div>
              <Button variant="ghost" onClick={() => onRestore(a.id)} aria-label={`Restore ${a.name}`}>Restore</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
