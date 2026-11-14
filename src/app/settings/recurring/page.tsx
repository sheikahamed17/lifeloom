'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { useRecurringRules } from '@/hooks/use-recurring-rules'
import { useCategories } from '@/hooks/use-categories'
import { useAllAccounts } from '@/hooks/use-all-accounts'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { formatMinor } from '@/lib/currency'
import { formatDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { PageShell } from '@/components/layout/page-shell'
import { UndoProvider, useUndo } from '@/components/providers/undo-provider'

const BACK = { href: '/settings', label: 'Settings' }
const DESCRIPTION = 'To make a new rule, turn on Repeat this entry when you add an entry.'
const PERIOD_NOUN = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' } as const

export default function RecurringSettingsPage() {
  return (
    <UndoProvider>
      <RecurringSettingsPageInner />
    </UndoProvider>
  )
}

function RecurringSettingsPageInner() {
  const router = useRouter()
  const undo = useUndo()
  const [userId, setUserId] = useState<string | null>(null)
  const { prefs } = useUserPrefs()

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  const rules = useRecurringRules(userId ?? undefined)
  const categories = useCategories(userId ?? undefined)
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const accounts = useAllAccounts(userId ?? undefined)
  const accountById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])

  async function setActive(id: string, value: 0 | 1) {
    if (!userId) return
    const op = await generateOp({
      entity_kind: 'recurring', entity_id: id,
      op_type: 'update', payload: { is_active: value },
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(console.error)
  }

  async function deleteRule(id: string) {
    if (!userId) return
    const deleted = rules.find(r => r.id === id)
    const op = await generateOp({
      entity_kind: 'recurring', entity_id: id,
      op_type: 'delete', payload: {},
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(console.error)
    // Undo re-asserts one field with a newer clock, which clears the tombstone.
    undo.push('Deleted recurring rule', async () => {
      await applyLocalOp(await generateOp({
        entity_kind: 'recurring', entity_id: id,
        op_type: 'update', payload: { is_active: deleted?.is_active ?? 1 },
        user_id: userId,
      }))
      pushPullOnce({ userId }).catch(console.error)
    })
  }

  if (!userId) {
    return (
      <PageShell title="Recurring rules" back={BACK} description={DESCRIPTION}>
        <Skeleton className="h-40 w-full rounded-xl" role="status" aria-label="Loading" />
      </PageShell>
    )
  }

  const activeRules = rules.filter(r => r.is_active)
  const pausedRules = rules.filter(r => !r.is_active)

  function renderRule(r: (typeof rules)[number]) {
    const cat = r.category_id ? categoryById.get(r.category_id) : undefined
    const periodText = `every ${r.interval_count > 1 ? `${r.interval_count} ` : ''}${PERIOD_NOUN[r.period]}${r.interval_count > 1 ? 's' : ''}`
    const isTransfer = !!(r.from_account_id && r.to_account_id)
    const fromName = isTransfer ? (accountById.get(r.from_account_id!)?.name ?? 'Unknown') : ''
    const toName = isTransfer ? (accountById.get(r.to_account_id!)?.name ?? 'Unknown') : ''
    const description = r.description?.trim()
    const title = description || cat?.name || (r.direction === 'out' ? 'Money out' : 'Money in')
    const label = isTransfer ? `transfer from ${fromName} to ${toName}` : title
    const metaParts = [
      isTransfer ? 'Transfer' : description && cat ? cat.name : null,
      periodText,
      `next ${formatDay(r.next_due_at, prefs.tz)}`,
    ].filter(Boolean).join(', ')
    const meta = metaParts.charAt(0).toUpperCase() + metaParts.slice(1)
    const paused = !r.is_active
    return (
      <li key={r.id} className="flex flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-border py-3.5 lg:py-3">
        <div className="flex min-w-0 flex-1 basis-full items-start gap-3 lg:basis-60 lg:items-center lg:gap-5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {isTransfer ? (
              <p className={cn('flex min-w-0 items-center gap-1.5 text-[15px] font-semibold', paused && 'text-muted-foreground')}>
                <span className="truncate">{fromName}</span>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="sr-only">to</span>
                <span className="truncate">{toName}</span>
              </p>
            ) : (
              <p className={cn('truncate text-[15px] font-semibold', paused && 'text-muted-foreground')}>{title}</p>
            )}
            <p className="text-[13px] text-muted-foreground">{meta}</p>
          </div>
          <span
            className={cn(
              'shrink-0 text-right text-base font-semibold tabular-nums lg:min-w-24',
              paused ? 'text-muted-foreground' : !isTransfer && r.direction === 'in' ? 'text-income' : 'text-foreground',
            )}
          >
            {isTransfer ? '' : r.direction === 'out' ? '−' : '+'}{formatMinor(r.amount, r.currency)}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="lg:w-[92px]" onClick={() => setActive(r.id, r.is_active ? 0 : 1)} aria-label={`${r.is_active ? 'Pause' : 'Resume'} ${label}`}>
            {r.is_active ? 'Pause' : 'Resume'}
          </Button>
          <Button variant="destructive" onClick={() => deleteRule(r.id)} aria-label={`Delete ${label}`}>
            Delete
          </Button>
        </div>
      </li>
    )
  }

  function countLabel(n: number) {
    return `${n} ${n === 1 ? 'rule' : 'rules'}`
  }

  return (
    <PageShell title="Recurring rules" back={BACK} description={DESCRIPTION}>
      {rules.length === 0 ? (
        <Empty className="rounded-none border-y border-border px-0 py-6">
          <EmptyDescription>
            No recurring rules yet. Turn on &quot;Repeat this entry&quot; when you add an entry to create one.
          </EmptyDescription>
        </Empty>
      ) : (
        <>
          {activeRules.length > 0 && (
            <section aria-labelledby="recurring-active" className="flex flex-col">
              <div className="flex items-end justify-between gap-2 border-b border-border pb-2.5">
                <h2 id="recurring-active" className="text-[19px] font-bold tracking-[-0.02em] lg:text-[22px]">Active</h2>
                <span className="text-[13px] text-muted-foreground">{countLabel(activeRules.length)}</span>
              </div>
              <ul>{activeRules.map(renderRule)}</ul>
            </section>
          )}
          {pausedRules.length > 0 && (
            <section aria-labelledby="recurring-paused" className="flex flex-col">
              <div className="flex items-end justify-between gap-2 border-b border-border pb-2.5">
                <h2 id="recurring-paused" className="text-[19px] font-bold tracking-[-0.02em] lg:text-[22px]">Paused</h2>
                <span className="text-[13px] text-muted-foreground">{countLabel(pausedRules.length)}</span>
              </div>
              <ul>{pausedRules.map(renderRule)}</ul>
            </section>
          )}
        </>
      )}
    </PageShell>
  )
}
