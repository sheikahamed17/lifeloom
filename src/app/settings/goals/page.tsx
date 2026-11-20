'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Pencil } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { useGoals } from '@/hooks/use-goals'
import { useArchivedGoals } from '@/hooks/use-archived-goals'
import { useAccounts } from '@/hooks/use-accounts'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { formatMajor, formatMinor, parseAmountFor } from '@/lib/currency'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { ArchivedCollapsible, COUNT_CLASS, FormField, SELECT_CLASS, SettingsCard } from '../_ui'
import { PageShell } from '@/components/layout/page-shell'
import { RowMenu } from '@/components/shared/row-menu'
import { UndoProvider, useUndo } from '@/components/providers/undo-provider'
import type { GoalRow } from '@/lib/dexie'

const BACK = { href: '/settings', label: 'Settings' }
const DESCRIPTION = 'Savings targets and your progress towards them.'

export default function GoalsPage() {
  return (
    <UndoProvider>
      <GoalsPageInner />
    </UndoProvider>
  )
}

function GoalsPageInner() {
  const router = useRouter()
  const undo = useUndo()
  const [userId, setUserId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newTargetAmount, setNewTargetAmount] = useState('')
  const [newCurrency, setNewCurrency] = useState<typeof SUPPORTED_CURRENCIES[number]>('INR')
  const [newAccountId, setNewAccountId] = useState<string | null>(null)
  const [newSavedAmount, setNewSavedAmount] = useState('')

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  const goals = useGoals(userId ?? undefined)
  const archived = useArchivedGoals(userId ?? undefined)
  const accounts = useAccounts(userId ?? undefined)

  const assetAccounts = accounts.filter(a => a.type === 'asset')

  async function addGoal() {
    if (!userId || !newName.trim() || !newTargetAmount.trim()) return
    const linkedAccount = newAccountId ? accounts.find(a => a.id === newAccountId) : null
    const currency = linkedAccount ? linkedAccount.currency : newCurrency
    // Typed amounts are read in the goal's currency (JPY is whole yen).
    const targetMinor = parseAmountFor(newTargetAmount, currency)
    if (targetMinor === null) return
    const savedMinor = linkedAccount ? 0 : (parseAmountFor(newSavedAmount, currency) ?? 0)

    const op = await generateOp({
      entity_kind: 'goal',
      entity_id: crypto.randomUUID(),
      op_type: 'create',
      payload: {
        name: newName.trim(),
        target_amount: targetMinor,
        currency,
        icon: null,
        account_id: newAccountId || null,
        saved_amount: savedMinor,
      },
      user_id: userId,
    })
    await applyLocalOp(op)
    setNewName('')
    setNewTargetAmount('')
    setNewCurrency('INR')
    setNewAccountId(null)
    setNewSavedAmount('')
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function updateGoal(id: string, payload: Record<string, string | number | null>) {
    if (!userId) return
    const op = await generateOp({
      entity_kind: 'goal',
      entity_id: id,
      op_type: 'update',
      payload,
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function archiveGoal(id: string) {
    const name = goals.find(g => g.id === id)?.name
    await updateGoal(id, { is_archived: 1 })
    undo.push(`Archived ${name ?? 'goal'}`, () => restoreGoal(id))
  }

  async function restoreGoal(id: string) {
    await updateGoal(id, { is_archived: 0 })
  }

  if (!userId) {
    return (
      <PageShell title="Goals" back={BACK} description={DESCRIPTION}>
        <Skeleton className="h-40 w-full rounded-xl" role="status" aria-label="Loading" />
      </PageShell>
    )
  }

  return (
    <PageShell title="Goals" back={BACK} description={DESCRIPTION}>
      <SettingsCard
        title="Active goals"
        className="gap-0"
        contentClassName="gap-0"
        action={goals.length > 0 ? <span className={COUNT_CLASS}>{goals.length}</span> : undefined}
      >
        <ul>
          {goals.length === 0 && <li className="border-b border-border"><Empty className="px-0 py-6"><EmptyDescription>Add your first goal.</EmptyDescription></Empty></li>}
          {goals.map(g => (
            <GoalRowItem
              key={g.id}
              goal={g}
              accounts={accounts}
              onArchive={archiveGoal}
              onUpdate={updateGoal}
            />
          ))}
        </ul>
      </SettingsCard>

      <SettingsCard title="Add a goal">
        <FormField label="Name" htmlFor="goal-name">
          <Input
            id="goal-name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="New laptop"
            maxLength={40}
            aria-label="Goal name"
          />
        </FormField>
        <FormField label="Target amount" htmlFor="goal-target">
          <Input
            id="goal-target"
            value={newTargetAmount}
            onChange={e => setNewTargetAmount(e.target.value)}
            placeholder="0"
            type="text"
            inputMode="decimal"
            aria-label="Target amount"
          />
        </FormField>
        <FormField
          label="Linked account"
          htmlFor="goal-account"
          hint="A linked goal tracks that account. Without one, you enter what you have saved."
        >
          <NativeSelect
            id="goal-account"
            value={newAccountId ?? 'none'}
            onChange={e => {
              const val = e.target.value
              setNewAccountId(val === 'none' ? null : val)
            }}
            className={SELECT_CLASS}
            aria-label="Linked account"
          >
            <NativeSelectOption value="none">No linked account</NativeSelectOption>
            {assetAccounts.map(acc => (
              <NativeSelectOption key={acc.id} value={acc.id}>{acc.name}</NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        {!newAccountId && (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Saved so far" htmlFor="goal-saved">
              <Input
                id="goal-saved"
                value={newSavedAmount}
                onChange={e => setNewSavedAmount(e.target.value)}
                placeholder="0"
                type="text"
                inputMode="decimal"
                aria-label="Saved so far"
              />
            </FormField>
            <FormField label="Currency" htmlFor="goal-currency">
              <NativeSelect
                id="goal-currency"
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
        )}
        <Button size="lg" onClick={addGoal}>Add goal</Button>
      </SettingsCard>

      {archived.length > 0 && (
        <ArchivedSection archived={archived} onRestore={restoreGoal} />
      )}
    </PageShell>
  )
}

function GoalRowItem({
  goal,
  accounts,
  onArchive,
  onUpdate,
}: {
  goal: GoalRow
  accounts: ReturnType<typeof useAccounts>
  onArchive: (id: string) => void
  onUpdate: (id: string, payload: Record<string, string | number | null>) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editTargetAmount, setEditTargetAmount] = useState('')
  const [editSavedAmount, setEditSavedAmount] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const linkedAccount = goal.account_id ? accounts.find(a => a.id === goal.account_id) : null

  function startEdit(g: GoalRow) {
    setEditingId(g.id)
    setEditName(g.name)
    setEditTargetAmount(formatMajor(g.target_amount, g.currency))
    setEditSavedAmount(formatMajor(g.saved_amount, g.currency))
  }

  async function saveEdit(id: string) {
    const trimmed = editName.trim()
    if (!trimmed || !editTargetAmount.trim()) return
    const targetMinor = parseAmountFor(editTargetAmount, goal.currency)
    if (targetMinor === null) return

    const payload: Record<string, string | number | null> = {
      name: trimmed,
      // The emoji field is gone from the form; the stored icon is passed through unchanged.
      icon: goal.icon ?? null,
      target_amount: targetMinor,
    }

    // Only update saved_amount if goal is not linked to an account
    if (!goal.account_id) {
      if (editSavedAmount.trim()) {
        const savedMinor = parseAmountFor(editSavedAmount, goal.currency)
        if (savedMinor !== null) {
          payload.saved_amount = savedMinor
        }
      }
    }

    await onUpdate(id, payload)
    setEditingId(null)
  }

  if (editingId === goal.id) {
    const fid = `goal-edit-${goal.id}`
    return (
      <li className="flex flex-col gap-4 border-b border-border py-4">
        <FormField label="Name" htmlFor={`${fid}-name`}>
          <Input
            id={`${fid}-name`}
            value={editName}
            onChange={e => setEditName(e.target.value)}
            maxLength={40}
            autoFocus
            aria-label="Goal name"
          />
        </FormField>
        <FormField label="Target amount" htmlFor={`${fid}-target`}>
          <Input
            id={`${fid}-target`}
            value={editTargetAmount}
            onChange={e => setEditTargetAmount(e.target.value)}
            placeholder="0"
            type="text"
            inputMode="decimal"
            aria-label="Target amount"
          />
        </FormField>
        {!goal.account_id && (
          <FormField label="Saved so far" htmlFor={`${fid}-saved`}>
            <Input
              id={`${fid}-saved`}
              value={editSavedAmount}
              onChange={e => setEditSavedAmount(e.target.value)}
              placeholder="0"
              type="text"
              inputMode="decimal"
              aria-label="Saved so far"
            />
          </FormField>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => saveEdit(goal.id)}>Save</Button>
          <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
        </div>
      </li>
    )
  }

  const target = formatMinor(goal.target_amount, goal.currency)
  // A linked goal's saved figure is the account's balance, which this page does not
  // compute, so the bar is drawn only for goals whose saved amount is entered here.
  const pct = goal.target_amount > 0
    ? Math.min(100, Math.max(0, Math.round((goal.saved_amount / goal.target_amount) * 100)))
    : 0

  return (
    <li className="flex items-center gap-3 border-b border-border py-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <p className="truncate text-[15px] font-semibold">{goal.name}</p>
          <p className="truncate text-[13px] text-muted-foreground">
            {linkedAccount
              ? `Target ${target}, tracks ${linkedAccount.name}`
              : `${formatMinor(goal.saved_amount, goal.currency)} saved of ${target}`}
          </p>
        </div>
        {!linkedAccount && (
          <div role="img" aria-label={`${pct}% of the target saved`} className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-foreground" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="-mr-2.5 flex shrink-0">
        <RowMenu
          label={`Actions for ${goal.name}`}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          items={[
            { label: 'Edit', icon: Pencil, onSelect: () => startEdit(goal) },
            { label: 'Archive', icon: Archive, onSelect: () => onArchive(goal.id) },
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
  archived: ReturnType<typeof useArchivedGoals>
  onRestore: (id: string) => void
}) {
  return (
    <ArchivedCollapsible count={archived.length}>
      <ul>
        {archived.map(g => (
          <li key={g.id} className="flex min-h-[52px] items-center justify-between gap-3 border-b border-border">
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{g.name}</span>
            <Button variant="link" className="shrink-0 px-1" onClick={() => onRestore(g.id)} aria-label={`Restore ${g.name}`}>Restore</Button>
          </li>
        ))}
      </ul>
    </ArchivedCollapsible>
  )
}
