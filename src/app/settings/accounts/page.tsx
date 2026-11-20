'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Pencil, Star } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { useAccounts } from '@/hooks/use-accounts'
import { useArchivedAccounts } from '@/hooks/use-archived-accounts'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { planAccountBackfill } from '@/lib/account-match'
import { tagEntries } from '@/lib/account-autotag'
import { defaultToggleUpdates, pickDefaultAccountId } from '@/lib/default-account'
import { formatMajor, formatMinor, parseAmountFor } from '@/lib/currency'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { ArchivedCollapsible, COUNT_CLASS, FormField, SELECT_CLASS, SettingsCard } from '../_ui'
import { PageShell } from '@/components/layout/page-shell'
import { IconTile } from '@/components/shared/icon-tile'
import { RowMenu } from '@/components/shared/row-menu'
import { UndoProvider, useUndo } from '@/components/providers/undo-provider'
import { db, type AccountRow } from '@/lib/dexie'

const BACK = { href: '/settings', label: 'Settings' }
const DESCRIPTION = 'Bank accounts and cards, and which card is which.'

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
    const openingBalanceMinor = parseAmountFor(newOpeningBalance, newCurrency)
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
        icon: null,
        match_hints: matchHints.trim() || null,
      },
      user_id: userId,
    })
    await applyLocalOp(op)
    setNewName('')
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
      <PageShell title="Accounts" back={BACK} description={DESCRIPTION}>
        <Skeleton className="h-40 w-full rounded-xl" role="status" aria-label="Loading" />
      </PageShell>
    )
  }

  return (
    <PageShell title="Accounts" back={BACK} description={DESCRIPTION}>
      <SettingsCard
        title="Active accounts"
        className="gap-0"
        contentClassName="gap-0"
        action={accounts.length > 0 ? <span className={COUNT_CLASS}>{accounts.length}</span> : undefined}
      >
        <ul>
          {accounts.length === 0 && <li className="border-b border-border"><Empty className="px-0 py-6"><EmptyDescription>Add your first account.</EmptyDescription></Empty></li>}
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
          <p className="pt-3 text-[13px] text-muted-foreground">
            The starred account is picked for you when you add an entry by hand, voice or receipt.
          </p>
        )}
      </SettingsCard>

      <SettingsCard
        title="Past alerts"
        className="gap-2"
        contentClassName="gap-2"
        action={backfill.length > 0 ? <span className="text-[13px] font-semibold text-warning">{backfill.length} untagged</span> : undefined}
      >
        {backfill.length > 0 ? (
          <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3.5">
            <p className="min-w-0 flex-1 text-sm">
              {backfill.length} past SMS or email {backfill.length === 1 ? 'entry matches' : 'entries match'} your accounts but {backfill.length === 1 ? 'has' : 'have'} no account yet.
            </p>
            <Button onClick={runBackfill} disabled={tagging} className="shrink-0">
              {tagging ? 'Tagging…' : `Tag ${backfill.length}`}
            </Button>
          </div>
        ) : (
          <p className="pt-2 text-sm text-muted-foreground">No untagged past alerts match your accounts.</p>
        )}
        <p role="status" className="text-sm text-muted-foreground empty:hidden">
          {tagged ? `Tagged ${tagged} past ${tagged === 1 ? 'entry' : 'entries'}.` : ''}
        </p>
      </SettingsCard>

      <SettingsCard title="Add an account">
        <FormField label="Name" htmlFor="acc-name">
          <Input
            id="acc-name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Tata Neu 5872"
            maxLength={40}
            aria-label="Account name"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Type" htmlFor="acc-type">
            <NativeSelect
              id="acc-type"
              value={newType}
              onChange={e => setNewType(e.target.value as 'asset' | 'liability')}
              className={SELECT_CLASS}
              aria-label="Account type"
            >
              <NativeSelectOption value="asset">{TYPE_WORD.asset}</NativeSelectOption>
              <NativeSelectOption value="liability">{TYPE_WORD.liability}</NativeSelectOption>
            </NativeSelect>
          </FormField>
          <FormField label="Currency" htmlFor="acc-currency">
            <NativeSelect
              id="acc-currency"
              value={newCurrency}
              onChange={e => setNewCurrency(e.target.value as typeof SUPPORTED_CURRENCIES[number])}
              className={SELECT_CLASS}
              aria-label="Currency"
            >
              {SUPPORTED_CURRENCIES.map(curr => (
                <NativeSelectOption key={curr} value={curr}>{curr}</NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <FormField label="Opening balance" htmlFor="acc-opening">
          <Input
            id="acc-opening"
            value={newOpeningBalance}
            onChange={e => setNewOpeningBalance(e.target.value)}
            placeholder="0"
            type="text"
            inputMode="decimal"
            aria-label="Opening balance"
          />
        </FormField>
        <FormField
          label="Auto-match hints"
          htmlFor="acc-hints"
          hint="The last four digits in the name are matched for you. Add hints only for extra numbers, like a debit card on a bank account."
        >
          <Input
            id="acc-hints"
            value={matchHints}
            onChange={e => setMatchHints(e.target.value)}
            placeholder="5678, hdfc credit"
            maxLength={200}
            aria-label="Auto-match hints"
          />
        </FormField>
        <Button size="lg" onClick={addAccount}>Add account</Button>
      </SettingsCard>

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
  const [editOpeningBalance, setEditOpeningBalance] = useState('')
  const [editMatchHints, setEditMatchHints] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  function startEdit(a: AccountRow) {
    setEditingId(a.id)
    setEditName(a.name)
    setEditOpeningBalance(formatMajor(a.opening_balance, a.currency))
    setEditMatchHints(a.match_hints ?? '')
  }

  async function saveEdit(id: string) {
    const trimmed = editName.trim()
    if (!trimmed || !editOpeningBalance.trim()) return
    const openingBalanceMinor = parseAmountFor(editOpeningBalance, account.currency)
    if (openingBalanceMinor === null) return
    await onUpdate(id, {
      name: trimmed,
      // The emoji field is gone from the form; the stored icon is passed through unchanged.
      icon: account.icon ?? null,
      opening_balance: openingBalanceMinor,
      match_hints: editMatchHints.trim() || null,
    })
    setEditingId(null)
  }

  if (editingId === account.id) {
    const fid = `acc-edit-${account.id}`
    return (
      <li className="flex flex-col gap-4 border-b border-border py-4">
        <FormField label="Name" htmlFor={`${fid}-name`}>
          <Input
            id={`${fid}-name`}
            value={editName}
            onChange={e => setEditName(e.target.value)}
            maxLength={40}
            autoFocus
            aria-label="Account name"
          />
        </FormField>
        <FormField label="Opening balance" htmlFor={`${fid}-opening`}>
          <Input
            id={`${fid}-opening`}
            value={editOpeningBalance}
            onChange={e => setEditOpeningBalance(e.target.value)}
            placeholder="0"
            type="text"
            inputMode="decimal"
            aria-label="Opening balance"
          />
        </FormField>
        <FormField label="Auto-match hints" htmlFor={`${fid}-hints`}>
          <Input
            id={`${fid}-hints`}
            value={editMatchHints}
            onChange={e => setEditMatchHints(e.target.value)}
            placeholder="5678, hdfc credit"
            maxLength={200}
            aria-label="Auto-match hints"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => saveEdit(account.id)}>Save</Button>
          <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
        </div>
      </li>
    )
  }

  // One line for name + figure, one muted line for what the figure is; actions stay compact.
  const meta = [TYPE_WORD[account.type], 'opening balance', account.match_hints ? `matches ${account.match_hints}` : null]
    .filter(Boolean)
    .join(', ')

  return (
    <li className="flex min-h-[60px] items-center gap-3 border-b border-border py-2">
      <IconTile name={account.name} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[15px] font-semibold">{account.name}</span>
          <span className="shrink-0 text-[15px] font-semibold tabular-nums">{formatMinor(account.opening_balance, account.currency)}</span>
        </div>
        <p className="truncate text-[13px] text-muted-foreground">{meta}</p>
      </div>
      <div className="-mr-2.5 flex shrink-0">
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={() => onToggleDefault(account.id)}
          aria-pressed={isDefault}
          aria-label={`Default account: ${account.name}`}
          title={isDefault ? 'Default account' : 'Make default'}
        >
          <Star className={isDefault ? 'size-5 fill-foreground text-foreground' : 'size-5 text-muted-foreground'} aria-hidden />
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
      </div>
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
  return (
    <ArchivedCollapsible count={archived.length}>
      <ul>
        {archived.map(a => (
          <li key={a.id} className="flex min-h-[60px] items-center justify-between gap-3 border-b border-border py-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate text-[15px] font-medium">{a.name}</p>
              <p className="text-[13px] text-muted-foreground">{TYPE_WORD[a.type]}</p>
            </div>
            <Button variant="link" className="shrink-0 px-1" onClick={() => onRestore(a.id)} aria-label={`Restore ${a.name}`}>Restore</Button>
          </li>
        ))}
      </ul>
    </ArchivedCollapsible>
  )
}
