'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight, ArrowRight, Pause, Play, Trash2 } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { useRecurringRules } from '@/hooks/use-recurring-rules'
import { useCategories } from '@/hooks/use-categories'
import { useAllAccounts } from '@/hooks/use-all-accounts'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { formatMinor } from '@/lib/currency'
import { formatDay } from '@/lib/format'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { PageShell } from '@/components/page-shell'
import { UndoProvider, useUndo } from '@/components/undo-provider'

const BACK = { href: '/settings', label: 'Settings' }
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
      <PageShell title="Recurring rules" back={BACK}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PageShell>
    )
  }

  return (
    <PageShell title="Recurring rules" back={BACK}>
      <ul className="glass divide-y divide-white/10 rounded-2xl">
        {rules.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">
            No recurring rules yet. Turn on &quot;Repeat this entry&quot; when you add an entry to create one.
          </li>
        )}
        {rules.map(r => {
          const cat = r.category_id ? categoryById.get(r.category_id) : undefined
          const periodText = `Every ${r.interval_count > 1 ? `${r.interval_count} ` : ''}${PERIOD_NOUN[r.period]}${r.interval_count > 1 ? 's' : ''}`
          const isTransfer = !!(r.from_account_id && r.to_account_id)
          const fromName = isTransfer ? (accountById.get(r.from_account_id!)?.name ?? 'Unknown') : ''
          const toName = isTransfer ? (accountById.get(r.to_account_id!)?.name ?? 'Unknown') : ''
          return (
            <li key={r.id} className="flex flex-col gap-1 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className={`flex items-center gap-1.5 font-mono tabular-nums ${isTransfer ? 'text-foreground' : r.direction === 'out' ? 'text-destructive' : 'text-income'}`}>
                  {isTransfer ? '' : r.direction === 'out' ? '−' : '+'}{formatMinor(r.amount, r.currency)}
                  {isTransfer && (
                    <>
                      <ArrowLeftRight className="size-4 text-muted-foreground" aria-hidden />
                      <span className="sr-only">transfer</span>
                    </>
                  )}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.is_active ? 'bg-income/15 text-income' : 'bg-white/10 text-muted-foreground'}`}>
                  {r.is_active ? 'Active' : 'Paused'}
                </span>
              </div>
              <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                {isTransfer && (
                  <>
                    <span>{fromName}</span>
                    <ArrowRight className="size-3 shrink-0" aria-hidden />
                    <span className="sr-only">to</span>
                    <span>{toName} ·</span>
                  </>
                )}
                {!isTransfer && cat && (
                  <span>
                    {cat.icon && <span aria-hidden="true" className="mr-1">{cat.icon}</span>}
                    {cat.name} ·
                  </span>
                )}
                <span>{periodText} · next {formatDay(r.next_due_at, prefs.tz)}</span>
              </p>
              <div className="mt-2 flex gap-2">
                <Button variant="outline" onClick={() => setActive(r.id, r.is_active ? 0 : 1)}>
                  {r.is_active ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                  {r.is_active ? 'Pause' : 'Resume'}
                </Button>
                <Button variant="ghost" onClick={() => deleteRule(r.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-4" aria-hidden />
                  Delete
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </PageShell>
  )
}
