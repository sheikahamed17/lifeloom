'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Trash2 } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { useAccounts } from '@/hooks/use-accounts'
import { useAllAccounts } from '@/hooks/use-all-accounts'
import { useTransfers } from '@/hooks/use-transfers'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { parseAmountInput } from '@/lib/parse-amount'
import { computeNextDue } from '@/lib/recurring'
import { formatMinor } from '@/lib/currency'
import { formatDay } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageShell } from '@/components/page-shell'
import { FIELD_SELECT } from '@/components/sort-control'
import { UndoProvider, useUndo } from '@/components/undo-provider'

const BACK = { href: '/settings', label: 'Settings' }

export default function TransfersPage() {
  return (
    <UndoProvider>
      <TransfersPageInner />
    </UndoProvider>
  )
}

function TransfersPageInner() {
  const router = useRouter()
  const undo = useUndo()
  const { prefs } = useUserPrefs()
  const [userId, setUserId] = useState<string | null>(null)
  const [fromAccountId, setFromAccountId] = useState<string | null>(null)
  const [toAccountId, setToAccountId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [note, setNote] = useState('')
  const [repeat, setRepeat] = useState(false)
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly')

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else {
        setUserId(res.data.user.id)
        // Set default date to today
        const today = new Date()
        setOccurredAt(today.toISOString().split('T')[0])
      }
    })
  }, [router])

  const accounts = useAccounts(userId ?? undefined)
  const allAccounts = useAllAccounts(userId ?? undefined)
  const transfers = useTransfers(userId ?? undefined)

  const fromAccount = fromAccountId ? accounts.find(a => a.id === fromAccountId) : null
  const eligibleToAccounts = useMemo(() => {
    if (!fromAccount) return []
    return accounts.filter(
      a => a.currency === fromAccount.currency && a.id !== fromAccount.id
    )
  }, [fromAccount, accounts])

  const accountNameMap = useMemo(() => {
    const map = new Map<string, string>()
    allAccounts.forEach(a => {
      map.set(a.id, a.name)
    })
    return map
  }, [allAccounts])

  async function addTransfer() {
    if (!userId || !fromAccountId || !toAccountId || !amount.trim() || !occurredAt.trim()) return
    const amountMinor = parseAmountInput(amount)
    if (amountMinor === null || amountMinor <= 0) return
    if (!fromAccount) return

    const op = await generateOp({
      entity_kind: 'transfer',
      entity_id: crypto.randomUUID(),
      op_type: 'create',
      payload: {
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: amountMinor,
        currency: fromAccount.currency,
        occurred_at: occurredAt,
        note: note.trim() || null,
      },
      user_id: userId,
    })
    await applyLocalOp(op)

    // Repeat: create a recurring rule carrying both account ids. The one-off
    // above covers "now"; the cron creates future transfers from next_due on.
    if (repeat) {
      const anchorIso = new Date(occurredAt + 'T12:00:00').toISOString()
      const nextDue = computeNextDue({
        id: '', period, interval_count: 1, anchor_at: anchorIso, next_due_at: anchorIso,
        occurrences_so_far: 0, end_condition_kind: 'never', end_until: null, end_count: null, is_active: 1,
      })
      const ruleOp = await generateOp({
        entity_kind: 'recurring',
        entity_id: crypto.randomUUID(),
        op_type: 'create',
        payload: {
          amount: amountMinor, currency: fromAccount.currency, direction: 'out', category_id: null,
          description: note.trim() || null, period, interval_count: 1,
          anchor_at: anchorIso, next_due_at: nextDue, end_condition_kind: 'never', is_active: 1,
          from_account_id: fromAccountId, to_account_id: toAccountId,
        },
        user_id: userId,
      })
      await applyLocalOp(ruleOp)
    }

    setFromAccountId(null)
    setToAccountId(null)
    setAmount('')
    setNote('')
    setRepeat(false)
    const today = new Date()
    setOccurredAt(today.toISOString().split('T')[0])
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function deleteTransfer(id: string) {
    if (!userId) return
    const deleted = transfers.find(t => t.id === id)
    const op = await generateOp({
      entity_kind: 'transfer',
      entity_id: id,
      op_type: 'delete',
      payload: {},
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    // Undo re-asserts one field with a newer clock, which clears the tombstone.
    undo.push('Deleted transfer', async () => {
      await applyLocalOp(await generateOp({ entity_kind: 'transfer', entity_id: id, op_type: 'update', payload: { note: deleted?.note ?? null }, user_id: userId }))
      pushPullOnce({ userId }).catch(err => console.error('sync', err))
    })
  }

  if (!userId) {
    return (
      <PageShell title="Transfers" back={BACK}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PageShell>
    )
  }

  const canSubmit = fromAccountId && toAccountId && amount.trim() && parseAmountInput(amount) !== null && parseAmountInput(amount)! > 0

  return (
    <PageShell title="Transfers" back={BACK}>
      <section className="glass flex flex-col gap-3 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Move money</h2>
        <select
          value={fromAccountId ?? 'none'}
          onChange={e => {
            const val = e.target.value
            setFromAccountId(val === 'none' ? null : val)
            setToAccountId(null) // Reset to-account when from changes
          }}
          className={FIELD_SELECT}
          aria-label="From account"
        >
          <option value="none">From account…</option>
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>
              {acc.icon ? `${acc.icon} ${acc.name}` : acc.name}
            </option>
          ))}
        </select>

        <select
          value={toAccountId ?? 'none'}
          onChange={e => {
            const val = e.target.value
            setToAccountId(val === 'none' ? null : val)
          }}
          disabled={eligibleToAccounts.length === 0}
          className={`${FIELD_SELECT} disabled:opacity-50`}
          aria-label="To account"
        >
          <option value="none">To account…</option>
          {eligibleToAccounts.map(acc => (
            <option key={acc.id} value={acc.id}>
              {acc.icon ? `${acc.icon} ${acc.name}` : acc.name}
            </option>
          ))}
        </select>

        {fromAccount && eligibleToAccounts.length === 0 && (
          <p className="text-xs text-muted-foreground">
            You have no other {fromAccount.currency} account to move money into.
          </p>
        )}

        <Input
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Amount"
          type="text"
          inputMode="decimal"
          aria-label="Transfer amount"
        />

        <Input
          value={occurredAt}
          onChange={e => setOccurredAt(e.target.value)}
          type="date"
          aria-label="Transfer date"
        />

        <Input
          value={note}
          onChange={e => setNote(e.target.value.slice(0, 120))}
          placeholder="Note (optional)"
          maxLength={120}
          aria-label="Transfer note"
        />

        <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white/5 px-3 text-sm">
          <span>Repeat</span>
          <input
            type="checkbox"
            checked={repeat}
            onChange={e => { const v = e.currentTarget.checked; setRepeat(v) }}
            className="size-5 shrink-0 accent-accent-2"
            aria-label="Repeat this transfer on a schedule"
          />
        </label>
        {repeat && (
          <select
            value={period}
            onChange={e => { const v = e.target.value as typeof period; setPeriod(v) }}
            aria-label="Repeat period"
            className={FIELD_SELECT}
          >
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
            <option value="monthly">Every month</option>
            <option value="yearly">Every year</option>
          </select>
        )}

        <Button
          onClick={addTransfer}
          disabled={!canSubmit}
          className="w-full"
        >
          {repeat ? 'Transfer and repeat' : 'Transfer'}
        </Button>
      </section>

      <section className="glass flex flex-col gap-2 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">History</h2>
        <ul className="glass-soft divide-y divide-white/10 rounded-lg">
          {transfers.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">No transfers yet.</li>
          )}
          {transfers.map(t => {
            const fromName = accountNameMap.get(t.from_account_id) || 'Unknown account'
            const toName = accountNameMap.get(t.to_account_id) || 'Unknown account'

            return (
              <li key={t.id} className="flex items-center gap-2 py-2 pl-3 pr-1">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm">
                      <span className="truncate">{fromName}</span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="sr-only">to</span>
                      <span className="truncate">{toName}</span>
                    </span>
                    <span className="shrink-0 font-mono text-sm tabular-nums">{formatMinor(t.amount, t.currency)}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDay(t.occurred_at, prefs.tz)}{t.note ? ` · ${t.note}` : ''}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  onClick={() => deleteTransfer(t.id)}
                  aria-label={`Delete transfer from ${fromName} to ${toName}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            )
          })}
        </ul>
      </section>
    </PageShell>
  )
}
