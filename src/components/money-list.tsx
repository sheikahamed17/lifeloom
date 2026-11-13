'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, Mail, MessageSquare, Paperclip, Pencil, Repeat, Split, Trash2, Users } from 'lucide-react'
import { SwipeRow } from '@/components/swipe-row'
import { RowMenu } from '@/components/row-menu'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useAllCategories } from '@/hooks/use-all-categories'
import { useAllAccounts } from '@/hooks/use-all-accounts'
import { useExpenseShares } from '@/hooks/use-expense-shares'
import { useAllPeople } from '@/hooks/use-all-people'
import { sharesByEntry, yourShare } from '@/lib/shares'
import { useUndo } from '@/components/undo-provider'
import { resurrectPayload } from '@/lib/undo-delete'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { currencySymbol, formatMinor } from '@/lib/currency'
import { convertViaRates } from '@/lib/fx'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { EntryTimestamp } from '@/components/entry-timestamp'
import { filterSortMoney } from '@/lib/money-filter-sort'
import { makeCategoryResolver } from '@/lib/category-resolve'
import { groupBySplit } from '@/lib/split-group'
import { signedAmount } from '@/lib/capture-feedback'
import { formatDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { MoneyEntryRow } from '@/lib/dexie'
import type { MoneyFilter, MoneySort } from '@/lib/money-filter-sort'

type Props = { userId: string; onEdit?: (row: MoneyEntryRow) => void; filter?: MoneyFilter; sort?: MoneySort }

// Small metadata chips under an entry: one shape, one size (12 px), Lucide icons only.
const META = 'inline-flex min-h-6 items-center gap-1 rounded-full border border-white/15 px-2 text-xs text-muted-foreground'

/** "−₹120" / "+₹85,000" (JPY whole), the same signed form the save toast uses. */
function formatAmount(e: MoneyEntryRow): string {
  return signedAmount(e.amount, e.currency, e.direction)
}

export function MoneyList({ userId, onEdit, filter, sort }: Props) {
  const entries = useMoneyEntries(userId)
  const allCats = useAllCategories(userId)
  const allAccounts = useAllAccounts(userId)
  const shares = useExpenseShares(userId)
  const allPeople = useAllPeople(userId)
  const sharesFor = useMemo(() => sharesByEntry(shares), [shares])
  const personName = useMemo(() => new Map(allPeople.map(p => [p.id, p.name])), [allPeople])
  const undo = useUndo()
  const router = useRouter()
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])
  const [expandedFx, setExpandedFx] = useState<string | null>(null)

  const accountById = useMemo(() => new Map(allAccounts.map(a => [a.id, a])), [allAccounts])

  // Display names span ALL categories (archived/tombstoned too), never "Uncategorized" for a live id.
  const resolve = useMemo(
    () => makeCategoryResolver(allCats.map(c => ({ id: c.id, name: c.name, icon: c.icon, kind: c.kind }))),
    [allCats],
  )

  const shown = useMemo(() => {
    if (!filter || !sort) return entries
    return filterSortMoney(entries, filter, sort, resolve)
  }, [entries, filter, sort, resolve])

  // Collapse split parts (shared split_group_id) into one expandable row.
  const groups = useMemo(() => groupBySplit(shown), [shown])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  function toggleGroup(id: string) {
    setExpandedGroups(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function deleteEntry(e: MoneyEntryRow) {
    await applyLocalOp(await generateOp({ entity_kind: 'money', entity_id: e.id, op_type: 'delete', payload: {}, user_id: userId }))
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    undo.push(`Deleted ${formatAmount(e)}`, async () => {
      await applyLocalOp(await generateOp({ entity_kind: 'money', entity_id: e.id, op_type: 'update', payload: resurrectPayload('money', e), user_id: userId }))
      pushPullOnce({ userId }).catch(err => console.error('sync', err))
    })
  }

  async function deleteGroup(parts: MoneyEntryRow[]) {
    for (const p of parts) {
      await applyLocalOp(await generateOp({ entity_kind: 'money', entity_id: p.id, op_type: 'delete', payload: {}, user_id: userId }))
    }
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    undo.push(`Deleted split (${parts.length} parts)`, async () => {
      for (const p of parts) {
        await applyLocalOp(await generateOp({ entity_kind: 'money', entity_id: p.id, op_type: 'update', payload: resurrectPayload('money', p), user_id: userId }))
      }
      pushPullOnce({ userId }).catch(err => console.error('sync', err))
    })
  }

  const filtered = !!filter && !!(filter.categoryName || filter.source || filter.direction || filter.from || filter.to || filter.tag)

  if (groups.length === 0) {
    return (
      <p className="glass-soft rounded-2xl p-4 text-sm text-muted-foreground">
        {filtered
          ? 'No entries match these filters.'
          : 'No money entries yet. Type “spent 80 on chai” above, or connect bank emails in Settings → Auto-import.'}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2" aria-labelledby="entries-heading">
      {groups.map(g => {
        if (g.kind === 'split') {
          const open = expandedGroups.has(g.groupId)
          const first = g.parts[0]
          return (
            <li key={g.groupId} id={`pulse-row-${g.groupId}`} className="glass-soft rounded-2xl p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.groupId)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 flex-col items-start gap-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-accent-2"
                >
                  <span className="text-sm font-medium md:text-base">{first.description || first.merchant || 'Split payment'}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Split className="size-3.5" aria-hidden />
                    Split {g.parts.length} ways
                    <ChevronDown className={cn('size-3.5 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
                  </span>
                  <EntryTimestamp occurredAt={first.occurred_at} />
                </button>
                <div className="flex flex-col items-end">
                  <span className={cn('whitespace-nowrap font-mono text-sm font-medium tabular-nums', first.direction === 'out' ? 'text-destructive' : 'text-income')}>
                    {signedAmount(g.total, first.currency, first.direction)}
                  </span>
                  <div className="-mb-2 -mr-2">
                    <RowMenu
                      label={`Actions for ${g.parts.length}-way split`}
                      open={menuFor === g.groupId}
                      onOpenChange={o => setMenuFor(o ? g.groupId : null)}
                      items={[{ label: `Delete split (${g.parts.length} parts)`, icon: Trash2, destructive: true, onSelect: () => deleteGroup(g.parts) }]}
                    />
                  </div>
                </div>
              </div>
              {open && (
                <ul className="mt-2 flex flex-col border-t border-white/10 pt-1" aria-label="Split parts">
                  {g.parts.map(p => {
                    const pc = resolve(p.category_id)
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {pc?.icon && <span aria-hidden="true">{pc.icon}</span>}
                          <span className="truncate text-muted-foreground">{pc?.name ?? 'Uncategorized'}</span>
                        </span>
                        <span className="flex items-center">
                          <span className="font-mono tabular-nums">{formatMinor(p.amount, p.currency)}</span>
                          {onEdit && (
                            <button
                              type="button"
                              aria-label={`Edit ${pc?.name ?? 'split part'}`}
                              onClick={() => onEdit(p)}
                              className="flex size-11 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-accent-2 focus-visible:ring-2 focus-visible:ring-accent-2"
                            >
                              <Pencil className="size-4" aria-hidden />
                            </button>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        }
        const e = g.entry
        const cat = resolve(e.category_id)
        const acc = e.account_id ? accountById.get(e.account_id) : undefined
        const mine = sharesFor.get(e.id)
        const shared = !!mine && mine.length > 0 && e.direction === 'out'
        const title = e.description || e.merchant || cat?.name || 'Uncategorized'
        return (
          <li key={e.id} id={`pulse-row-${e.id}`}>
            <SwipeRow
              isOpen={openId === e.id}
              onOpenChange={o => setOpenId(o ? e.id : null)}
              onTap={onEdit ? () => onEdit(e) : undefined}
              onLongPress={() => setMenuFor(e.id)}
              onDelete={() => deleteEntry(e)}
              deleteLabel={`Delete ${title} ${formatAmount(e)}`}
              className="glass-soft flex items-start justify-between gap-3 rounded-2xl p-3 text-sm transition-colors hover:bg-white/8"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-sm font-medium text-foreground md:text-base">{title}</p>
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  {cat && (
                    <span className="inline-flex items-center gap-1">
                      {cat.icon && <span aria-hidden="true">{cat.icon}</span>}
                      {cat.name}
                    </span>
                  )}
                  {e.merchant && e.merchant !== title && <span>· {e.merchant}</span>}
                  {acc && (
                    <span className="inline-flex items-center gap-1">
                      · {acc.icon && <span aria-hidden="true">{acc.icon}</span>}{acc.name}
                    </span>
                  )}
                  {!acc && e.account_id && <span>· Unknown account</span>}
                </p>
                {(e.tags?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(e.tags ?? []).map(tag => <span key={tag} className={META}>{tag}</span>)}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <EntryTimestamp occurredAt={e.occurred_at} />
                  {e.source === 'email' && <span className={META}><Mail className="size-3" aria-hidden />Email</span>}
                  {e.source === 'sms' && <span className={META}><MessageSquare className="size-3" aria-hidden />SMS</span>}
                  {e.recurring_rule_id && <span className={META}><Repeat className="size-3" aria-hidden />Recurring</span>}
                  {e.currency !== prefs.primary_currency && (
                    <button
                      type="button"
                      className={cn(META, 'outline-none hover:text-accent-2 focus-visible:ring-2 focus-visible:ring-accent-2')}
                      aria-expanded={expandedFx === e.id}
                      onClick={() => setExpandedFx(expandedFx === e.id ? null : e.id)}
                    >
                      {expandedFx === e.id ? (() => {
                        const conv = convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})
                        return conv
                          ? `≈ ${formatMinor(conv.amount, prefs.primary_currency)} at the ${formatDay(conv.rateDate)} rate`
                          : 'No exchange rate for this date yet'
                      })() : `In ${currencySymbol(prefs.primary_currency)}`}
                    </button>
                  )}
                  {shared && mine!.map(s => (
                    <Link
                      key={s.id}
                      href={`/settings/people#${s.person_id}`}
                      className={cn(
                        META,
                        'relative outline-none transition-colors before:absolute before:-inset-y-2.5 before:inset-x-0 focus-visible:ring-2 focus-visible:ring-accent-2',
                        !s.settled_at && 'border-accent-2/40 text-accent-2 hover:bg-accent-2/10',
                      )}
                    >
                      <Users className="size-3" aria-hidden />
                      {personName.get(s.person_id) ?? 'Someone'} {s.settled_at ? 'paid' : `owes ${formatMinor(s.amount, e.currency)}`}
                    </Link>
                  ))}
                  {e.receipt_key && (
                    <a
                      href={`/api/receipt/${e.receipt_key}`}
                      target="_blank"
                      rel="noopener"
                      className={cn(META, 'relative outline-none before:absolute before:-inset-y-2.5 before:inset-x-0 hover:text-accent-2 focus-visible:ring-2 focus-visible:ring-accent-2')}
                    >
                      <Paperclip className="size-3" aria-hidden />Receipt
                    </a>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end">
                {shared ? (
                  <span className="flex flex-col items-end" title={`Full payment ${formatAmount(e)}; the rest is owed to you`}>
                    <span className="whitespace-nowrap font-mono text-sm font-medium tabular-nums text-destructive">
                      you {signedAmount(yourShare(e, mine), e.currency, 'out')}
                    </span>
                    <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">of {formatAmount(e)}</span>
                  </span>
                ) : (
                  <span className={cn('whitespace-nowrap font-mono text-sm font-medium tabular-nums', e.direction === 'out' ? 'text-destructive' : 'text-income')}>
                    {formatAmount(e)}
                  </span>
                )}
                <div className="-mb-2 -mr-2">
                  <RowMenu
                    label={`Actions for ${title} ${formatAmount(e)}`}
                    open={menuFor === e.id}
                    onOpenChange={o => setMenuFor(o ? e.id : null)}
                    items={[
                      ...(onEdit ? [{ label: 'Edit', icon: Pencil, onSelect: () => onEdit(e) }] : []),
                      ...(e.recurring_rule_id ? [{ label: 'Edit recurring rule', icon: Repeat, onSelect: () => router.push('/settings/recurring') }] : []),
                      { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => deleteEntry(e) },
                    ]}
                  />
                </div>
              </div>
            </SwipeRow>
          </li>
        )
      })}
    </ul>
  )
}
