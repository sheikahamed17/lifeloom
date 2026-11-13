'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { useGoals } from '@/hooks/use-goals'
import { useArchivedGoals } from '@/hooks/use-archived-goals'
import { useAccounts } from '@/hooks/use-accounts'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { parseAmountInput } from '@/lib/parse-amount'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { currencySymbol } from '@/lib/currency'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuroraBackground } from '@/components/aurora-background'
import type { GoalRow } from '@/lib/dexie'

export default function GoalsPage() {
  const router = useRouter()
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
    await updateGoal(id, { is_archived: 1 })
  }

  async function restoreGoal(id: string) {
    await updateGoal(id, { is_archived: 0 })
  }

  if (!userId) return <p className="p-8">Loading…</p>

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex w-full max-w-md md:max-w-3xl flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Goals</h1>
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
                aria-label="Goal name"
              />
              <Input
                value={newIcon}
                onChange={e => setNewIcon(e.target.value)}
                placeholder="Emoji"
                maxLength={8}
                className="w-20 text-center"
                aria-label="Goal icon"
              />
            </div>
            <div className="flex gap-2">
              <Input
                value={newTargetAmount}
                onChange={e => setNewTargetAmount(e.target.value)}
                placeholder="Target amount…"
                type="text"
                inputMode="decimal"
                aria-label="Target amount"
              />
              <select
                value={newAccountId ?? 'none'}
                onChange={e => {
                  const val = e.target.value
                  setNewAccountId(val === 'none' ? null : val)
                }}
                className="glass-soft rounded-lg border border-input px-2 text-sm transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-accent-2"
                aria-label="Link to account"
              >
                <option value="none">Not linked</option>
                {assetAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>
            {!newAccountId && (
              <div className="flex gap-2">
                <Input
                  value={newSavedAmount}
                  onChange={e => setNewSavedAmount(e.target.value)}
                  placeholder="Saved so far…"
                  type="text"
                  inputMode="decimal"
                  aria-label="Saved amount"
                />
              </div>
            )}
            {!newAccountId && (
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
            )}
            <div className="flex gap-2">
              <Button onClick={addGoal} className="flex-1">Add</Button>
            </div>
          </div>
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Active Goals</h2>
          <ul className="glass-soft divide-y divide-white/10 rounded-lg border border-white/10">
            {goals.length === 0 && <li className="p-3 text-sm text-muted-foreground">Add your first goal.</li>}
            {goals.map(g => (
              <GoalRow
                key={g.id}
                goal={g}
                accounts={accounts}
                onArchive={archiveGoal}
                onUpdate={updateGoal}
              />
            ))}
          </ul>
        </section>

        {archived.length > 0 && (
          <ArchivedSection archived={archived} onRestore={restoreGoal} />
        )}
      </main>
    </>
  )
}

function GoalRow({
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
      <li className="flex flex-col gap-2 py-3 px-3">
        <div className="flex gap-2">
          <Input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            placeholder="Name…"
            maxLength={40}
            autoFocus
            className="flex-1"
            aria-label="Edit goal name"
          />
          <Input
            value={editIcon}
            onChange={e => setEditIcon(e.target.value)}
            placeholder="Emoji"
            maxLength={8}
            className="w-20 text-center"
            aria-label="Edit goal icon"
          />
        </div>
        <Input
          value={editTargetAmount}
          onChange={e => setEditTargetAmount(e.target.value)}
          placeholder="Target amount…"
          type="text"
          inputMode="decimal"
          aria-label="Edit target amount"
        />
        {!goal.account_id && (
          <Input
            value={editSavedAmount}
            onChange={e => setEditSavedAmount(e.target.value)}
            placeholder="Saved so far…"
            type="text"
            inputMode="decimal"
            aria-label="Edit saved amount"
          />
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => saveEdit(goal.id)}
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
    <li className="flex items-center justify-between p-3">
      <span className="text-sm">
        {goal.icon && <span className="mr-1">{goal.icon}</span>}
        {goal.name} · {currencySymbol(goal.currency)} {(goal.target_amount / divisor).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        {linkedAccount && <span className="ml-2 text-xs text-muted-foreground">({linkedAccount.name})</span>}
        {!linkedAccount && <span className="ml-2 text-xs text-muted-foreground">saved {currencySymbol(goal.currency)} {(goal.saved_amount / divisor).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => startEdit(goal)}
          style={{ height: '44px', minWidth: '44px' }}
          aria-label={`Edit ${goal.name}`}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onArchive(goal.id)}
          style={{ height: '44px', minWidth: '44px' }}
          aria-label={`Archive ${goal.name}`}
        >
          Archive
        </Button>
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
          {archived.map(g => (
            <li key={g.id} className="flex items-center justify-between p-3">
              <span className="text-sm">
                {g.icon && <span className="mr-1">{g.icon}</span>}
                {g.name}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRestore(g.id)}
                style={{ height: '44px', minWidth: '44px' }}
                aria-label={`Restore ${g.name}`}
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
