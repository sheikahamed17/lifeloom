'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Pencil } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { useGoals } from '@/hooks/use-goals'
import { useArchivedGoals } from '@/hooks/use-archived-goals'
import { useAccounts } from '@/hooks/use-accounts'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { parseAmountInput } from '@/lib/parse-amount'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { formatMinor } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { ArchivedCollapsible, SELECT_CLASS, SettingsCard } from '../_ui'
import { PageShell } from '@/components/layout/page-shell'
import { RowMenu } from '@/components/shared/row-menu'
import { UndoProvider, useUndo } from '@/components/providers/undo-provider'
import type { GoalRow } from '@/lib/dexie'

const BACK = { href: '/settings', label: 'Settings' }

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
  const [newIcon, setNewIcon] = useState('')
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
    const targetMinor = parseAmountInput(newTargetAmount)
    if (targetMinor === null) return

    const linkedAccount = newAccountId ? accounts.find(a => a.id === newAccountId) : null
    const currency = linkedAccount ? linkedAccount.currency : newCurrency
    const savedMinor = linkedAccount ? 0 : (parseAmountInput(newSavedAmount) ?? 0)

    const op = await generateOp({
      entity_kind: 'goal',
      entity_id: crypto.randomUUID(),
      op_type: 'create',
      payload: {
        name: newName.trim(),
        target_amount: targetMinor,
        currency,
        icon: newIcon.trim() || null,
        account_id: newAccountId || null,
        saved_amount: savedMinor,
      },
      user_id: userId,
    })
    await applyLocalOp(op)
    setNewName('')
    setNewIcon('')
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
      <PageShell title="Goals" back={BACK}>
        <Skeleton className="h-40 w-full rounded-xl" role="status" aria-label="Loading" />
      </PageShell>
    )
  }

  return (
    <PageShell title="Goals" back={BACK}>
      <SettingsCard title="Add a goal">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Name"
            maxLength={40}
            aria-label="Goal name"
          />
          <Input
            value={newIcon}
            onChange={e => setNewIcon(e.target.value)}
            placeholder="Emoji"
            maxLength={8}
            className="w-20 text-center"
            aria-label="Goal emoji"
          />
        </div>
        <div className="flex gap-2">
          <Input
            value={newTargetAmount}
            onChange={e => setNewTargetAmount(e.target.value)}
            placeholder="Target amount"
            type="text"
            inputMode="decimal"
            className="h-11"
            aria-label="Target amount"
          />
          <NativeSelect
            value={newAccountId ?? 'none'}
            onChange={e => {
              const val = e.target.value
              setNewAccountId(val === 'none' ? null : val)
            }}
            className={cn(SELECT_CLASS, 'w-auto max-w-[50%]')}
            aria-label="Linked account"
          >
            <NativeSelectOption value="none">No linked account</NativeSelectOption>
            {assetAccounts.map(acc => (
              <NativeSelectOption key={acc.id} value={acc.id}>{acc.name}</NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {!newAccountId && (
          <div className="flex gap-2">
            <Input
              value={newSavedAmount}
              onChange={e => setNewSavedAmount(e.target.value)}
              placeholder="Saved so far"
              type="text"
              inputMode="decimal"
              className="h-11"
              aria-label="Saved so far"
            />
            <NativeSelect
              value={newCurrency}
              onChange={e => setNewCurrency(e.target.value as typeof SUPPORTED_CURRENCIES[number])}
              className={cn(SELECT_CLASS, 'w-auto')}
              aria-label="Currency"
            >
              {SUPPORTED_CURRENCIES.map(curr => (
                <NativeSelectOption key={curr} value={curr}>{curr}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
        <Button onClick={addGoal} className="w-full">Add</Button>
      </SettingsCard>

      <SettingsCard title="Active goals" contentClassName="gap-2">
        <ul className="glass-soft divide-y divide-border rounded-lg">
          {goals.length === 0 && <li><Empty className="p-3"><EmptyDescription>Add your first goal.</EmptyDescription></Empty></li>}
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
  const [editIcon, setEditIcon] = useState('')
  const [editTargetAmount, setEditTargetAmount] = useState('')
  const [editSavedAmount, setEditSavedAmount] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const divisor = goal.currency === 'JPY' ? 1 : 100
  const linkedAccount = goal.account_id ? accounts.find(a => a.id === goal.account_id) : null

  function startEdit(g: GoalRow) {
    setEditingId(g.id)
    setEditName(g.name)
    setEditIcon(g.icon ?? '')
    setEditTargetAmount((g.target_amount / divisor).toLocaleString(undefined, { maximumFractionDigits: 2 }))
    setEditSavedAmount((g.saved_amount / divisor).toLocaleString(undefined, { maximumFractionDigits: 2 }))
  }

  async function saveEdit(id: string) {
    const trimmed = editName.trim()
    if (!trimmed || !editTargetAmount.trim()) return
    const targetMinor = parseAmountInput(editTargetAmount)
    if (targetMinor === null) return

    const payload: Record<string, string | number | null> = {
      name: trimmed,
      icon: editIcon.trim() || null,
      target_amount: targetMinor,
    }

    // Only update saved_amount if goal is not linked to an account
    if (!goal.account_id) {
      if (editSavedAmount.trim()) {
        const savedMinor = parseAmountInput(editSavedAmount)
        if (savedMinor !== null) {
          payload.saved_amount = savedMinor
        }
      }
    }

    await onUpdate(id, payload)
    setEditingId(null)
  }

  if (editingId === goal.id) {
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
            aria-label="Goal name"
          />
          <Input
            value={editIcon}
            onChange={e => setEditIcon(e.target.value)}
            placeholder="Emoji"
            maxLength={8}
            className="w-20 text-center"
            aria-label="Goal emoji"
          />
        </div>
        <Input
          value={editTargetAmount}
          onChange={e => setEditTargetAmount(e.target.value)}
          placeholder="Target amount"
          type="text"
          inputMode="decimal"
          aria-label="Target amount"
        />
        {!goal.account_id && (
          <Input
            value={editSavedAmount}
            onChange={e => setEditSavedAmount(e.target.value)}
            placeholder="Saved so far"
            type="text"
            inputMode="decimal"
            aria-label="Saved so far"
          />
        )}
        <div className="flex gap-2">
          <Button onClick={() => saveEdit(goal.id)} className="flex-1">Save</Button>
          <Button variant="outline" onClick={() => setEditingId(null)} className="flex-1">Cancel</Button>
        </div>
      </li>
    )
  }

  const target = formatMinor(goal.target_amount, goal.currency)

  return (
    <li className="flex items-center gap-1 py-2 pl-3 pr-1">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {goal.icon && <span aria-hidden="true" className="mr-1.5">{goal.icon}</span>}
          {goal.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {linkedAccount
            ? `Target ${target} · tracks ${linkedAccount.name}`
            : `${formatMinor(goal.saved_amount, goal.currency)} saved of ${target}`}
        </p>
      </div>
      <RowMenu
        label={`Actions for ${goal.name}`}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        items={[
          { label: 'Edit', icon: Pencil, onSelect: () => startEdit(goal) },
          { label: 'Archive', icon: Archive, onSelect: () => onArchive(goal.id) },
        ]}
      />
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
      <ul className="glass-soft divide-y divide-border rounded-lg">
        {archived.map(g => (
          <li key={g.id} className="flex min-h-14 items-center justify-between gap-2 py-1 pl-3 pr-1">
            <span className="min-w-0 truncate text-sm">
              {g.icon && <span aria-hidden="true" className="mr-1.5">{g.icon}</span>}
              {g.name}
            </span>
            <Button variant="ghost" onClick={() => onRestore(g.id)} aria-label={`Restore ${g.name}`}>Restore</Button>
          </li>
        ))}
      </ul>
    </ArchivedCollapsible>
  )
}
