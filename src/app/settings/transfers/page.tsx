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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Field, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { COUNT_CLASS, FormField, SELECT_CLASS, SettingsCard } from '../_ui'
import { PageShell } from '@/components/layout/page-shell'
import { UndoProvider, useUndo } from '@/components/providers/undo-provider'

const BACK = { href: '/settings', label: 'Settings' }
const DESCRIPTION = 'Move money between your accounts.'

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
      <PageShell title="Transfers" back={BACK} description={DESCRIPTION}>
        <Skeleton className="h-40 w-full rounded-xl" role="status" aria-label="Loading" />
      </PageShell>
    )
  }

  const canSubmit = fromAccountId && toAccountId && amount.trim() && parseAmountInput(amount) !== null && parseAmountInput(amount)! > 0

  return (
    <PageShell title="Transfers" back={BACK} description={DESCRIPTION}>
      <SettingsCard title="Move money">
        <FormField label="From account" htmlFor="tr-from">
          <NativeSelect
            id="tr-from"
            value={fromAccountId ?? 'none'}
            onChange={e => {
              const val = e.target.value
              setFromAccountId(val === 'none' ? null : val)
              setToAccountId(null) // Reset to-account when from changes
            }}
            className={SELECT_CLASS}
            aria-label="From account"
          >
            <NativeSelectOption value="none">From account…</NativeSelectOption>
            {accounts.map(acc => (
              <NativeSelectOption key={acc.id} value={acc.id}>{acc.name}</NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>

        <FormField
          label="To account"
          htmlFor="tr-to"
          hint={fromAccount && eligibleToAccounts.length === 0
            ? `You have no other ${fromAccount.currency} account to move money into.`
            : undefined}
        >
          <NativeSelect
            id="tr-to"
            value={toAccountId ?? 'none'}
            onChange={e => {
              const val = e.target.value
              setToAccountId(val === 'none' ? null : val)
            }}
            disabled={eligibleToAccounts.length === 0}
            className={SELECT_CLASS}
            aria-label="To account"
          >
            <NativeSelectOption value="none">To account…</NativeSelectOption>
            {eligibleToAccounts.map(acc => (
              <NativeSelectOption key={acc.id} value={acc.id}>{acc.name}</NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>

        <FormField label="Amount" htmlFor="tr-amount">
          <Input
            id="tr-amount"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            type="text"
            inputMode="decimal"
            aria-label="Transfer amount"
          />
        </FormField>

        <FormField label="Date" htmlFor="tr-date">
          <Input
            id="tr-date"
            value={occurredAt}
            onChange={e => setOccurredAt(e.target.value)}
            type="date"
            aria-label="Transfer date"
          />
        </FormField>

        <FormField label="Note, if you want one" htmlFor="tr-note">
          <Input
            id="tr-note"
            value={note}
            onChange={e => setNote(e.target.value.slice(0, 120))}
            maxLength={120}
            aria-label="Transfer note"
          />
        </FormField>

        <Field orientation="horizontal" className="min-h-[60px] items-center justify-between gap-3 border-y border-border">
          <FieldLabel htmlFor="transfer-repeat" className="text-[15px] font-medium text-foreground">Repeat this transfer</FieldLabel>
          <Switch
            id="transfer-repeat"
            checked={repeat}
            onCheckedChange={v => setRepeat(v)}
            aria-label="Repeat this transfer on a schedule"
          />
        </Field>
        {repeat && (
          <FormField label="How often" htmlFor="tr-period">
            <NativeSelect
              id="tr-period"
              value={period}
              onChange={e => { const v = e.target.value as typeof period; setPeriod(v) }}
              aria-label="Repeat period"
              className={SELECT_CLASS}
            >
              <NativeSelectOption value="daily">Every day</NativeSelectOption>
              <NativeSelectOption value="weekly">Every week</NativeSelectOption>
              <NativeSelectOption value="monthly">Every month</NativeSelectOption>
              <NativeSelectOption value="yearly">Every year</NativeSelectOption>
            </NativeSelect>
          </FormField>
        )}

        <Button
          size="lg"
          onClick={addTransfer}
          disabled={!canSubmit}
          className="w-full"
        >
          {repeat ? 'Transfer and repeat' : 'Transfer'}
        </Button>
      </SettingsCard>

      <SettingsCard
        title="History"
        className="gap-0"
        contentClassName="gap-0"
        action={transfers.length > 0
          ? <span className={COUNT_CLASS}>{transfers.length} {transfers.length === 1 ? 'transfer' : 'transfers'}</span>
          : undefined}
      >
        {transfers.length === 0 ? (
          <Empty className="rounded-none border-b border-border px-0 py-6">
            <EmptyDescription>No transfers yet.</EmptyDescription>
          </Empty>
        ) : (
          <ul>
            {transfers.map(t => {
              const fromName = accountNameMap.get(t.from_account_id) || 'Unknown account'
              const toName = accountNameMap.get(t.to_account_id) || 'Unknown account'

              return (
                <li key={t.id} className="flex min-h-16 items-center gap-3 border-b border-border py-2 lg:min-h-[60px] lg:gap-6">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 lg:flex-row lg:items-center lg:gap-6">
                    <span className="flex min-w-0 items-center gap-1.5 text-[15px] font-medium lg:flex-1">
                      <span className="truncate">{fromName}</span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="sr-only">to</span>
                      <span className="truncate">{toName}</span>
                    </span>
                    <p className="truncate text-[13px] text-muted-foreground lg:flex-1 lg:text-sm">
                      {formatDay(t.occurred_at, prefs.tz)}{t.note ? `, ${t.note}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-[15px] font-semibold tabular-nums lg:min-w-[88px] lg:text-base">{formatMinor(t.amount, t.currency)}</span>
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    onClick={() => deleteTransfer(t.id)}
                    aria-label={`Delete transfer from ${fromName} to ${toName}`}
                    className="-mr-2 shrink-0 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-5" aria-hidden />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </SettingsCard>
    </PageShell>
  )
}
