'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, Mail, MessageSquare, Paperclip, Pencil, Repeat, Split, Trash2, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { Separator } from '@/components/ui/separator'
import { SwipeRow } from '@/components/shared/swipe-row'
import { RowMenu } from '@/components/shared/row-menu'
import { IconTile } from '@/components/shared/icon-tile'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useAllCategories } from '@/hooks/use-all-categories'
import { useAllAccounts } from '@/hooks/use-all-accounts'
import { useExpenseShares } from '@/hooks/use-expense-shares'
import { useAllPeople } from '@/hooks/use-all-people'
import { sharesByEntry, yourShare } from '@/lib/shares'
import { useUndo } from '@/components/providers/undo-provider'
import { resurrectPayload } from '@/lib/undo-delete'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { currencySymbol, formatMinor } from '@/lib/currency'
import { convertViaRates } from '@/lib/fx'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { EntryTimestamp } from '@/components/money/entry-timestamp'
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
const META = 'h-auto min-h-6 overflow-visible border-border px-2 font-normal text-muted-foreground'

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
      <Empty className="glass-soft p-4">
        <EmptyDescription>
          {filtered
            ? 'No entries match these filters.'
            : 'No money entries yet. Type “spent 80 on chai” above, or connect bank emails in Settings → Auto-import.'}
        </EmptyDescription>
      </Empty>
    )
  }

  return (
    <ul className="glass flex flex-col divide-y divide-border overflow-hidden rounded-xl" aria-labelledby="entries-heading">
      {groups.map(g => {
        if (g.kind === 'split') {
          const open = expandedGroups.has(g.groupId)
          const first = g.parts[0]
          return (
            <li key={g.groupId} id={`pulse-row-${g.groupId}`} className="px-4 py-3.5 text-sm">
              <Collapsible open={open} onOpenChange={() => toggleGroup(g.groupId)}>
                <div className="flex items-start gap-3">
                  <IconTile icon={Split} />
                  <CollapsibleTrigger
                    render={<Button variant="ghost" />}
                    className="h-auto min-w-0 flex-1 flex-col items-start justify-start gap-1 whitespace-normal px-0 py-0 text-left font-normal hover:bg-transparent"
                  >
                    <span className="text-base font-medium leading-tight">{first.description || first.merchant || 'Split payment'}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Split className="size-3.5" aria-hidden />
                      Split {g.parts.length} ways
                      <ChevronDown className={cn('size-3.5 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
                    </span>
                    <EntryTimestamp occurredAt={first.occurred_at} />
                  </CollapsibleTrigger>
                  <div className="flex flex-col items-end">
                    <span className={cn('whitespace-nowrap tabular-nums text-base font-semibold', first.direction === 'out' ? 'text-destructive' : 'text-income')}>
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
                <CollapsibleContent>
                  <Separator className="mt-2" />
                  <ul className="flex flex-col pt-1" aria-label="Split parts">
                    {g.parts.map(p => {
                      const pc = resolve(p.category_id)
                      return (
                        <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-1.5">
                            {pc?.icon && <span aria-hidden="true">{pc.icon}</span>}
                            <span className="truncate text-muted-foreground">{pc?.name ?? 'Uncategorized'}</span>
                          </span>
                          <span className="flex items-center">
                            <span className="tabular-nums">{formatMinor(p.amount, p.currency)}</span>
                            {onEdit && (
                              <Button
                                variant="ghost"
                                size="icon-lg"
                                aria-label={`Edit ${pc?.name ?? 'split part'}`}
                                onClick={() => onEdit(p)}
                                className="text-muted-foreground hover:text-accent-2"
                              >
                                <Pencil className="size-4" aria-hidden />
                              </Button>
                            )}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
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
              className="flex items-start gap-3 bg-card px-4 py-3.5 text-sm transition-colors hover:bg-accent"
            >
              <IconTile emoji={cat?.icon} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-base font-medium leading-tight text-foreground">{title}</p>
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  {cat && <span>{cat.name}</span>}
                  {e.merchant && e.merchant !== title && <span>· {e.merchant}</span>}
                  {acc && <span>· {acc.name}</span>}
                  {!acc && e.account_id && <span>· Unknown account</span>}
                </p>
                {(e.tags?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(e.tags ?? []).map(tag => <Badge key={tag} variant="outline" className={META}>{tag}</Badge>)}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <EntryTimestamp occurredAt={e.occurred_at} />
                  {e.source === 'email' && <Badge variant="outline" className={META}><Mail aria-hidden />Email</Badge>}
                  {e.source === 'sms' && <Badge variant="outline" className={META}><MessageSquare aria-hidden />SMS</Badge>}
                  {e.recurring_rule_id && <Badge variant="outline" className={META}><Repeat aria-hidden />Recurring</Badge>}
                  {e.currency !== prefs.primary_currency && (
                    <Button
                      variant="outline"
                      size="xs"
                      className={cn(META, 'relative rounded-full bg-transparent before:absolute before:-inset-y-2.5 before:inset-x-0 hover:bg-transparent hover:text-accent-2')}
                      aria-expanded={expandedFx === e.id}
                      onClick={() => setExpandedFx(expandedFx === e.id ? null : e.id)}
                    >
                      {expandedFx === e.id ? (() => {
                        const conv = convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})
                        return conv
                          ? `≈ ${formatMinor(conv.amount, prefs.primary_currency)} at the ${formatDay(conv.rateDate)} rate`
                          : 'No exchange rate for this date yet'
                      })() : `In ${currencySymbol(prefs.primary_currency)}`}
                    </Button>
                  )}
                  {shared && mine!.map(s => (
                    <Badge
                      key={s.id}
                      variant="outline"
                      render={<Link href={`/settings/people#${s.person_id}`} />}
                      className={cn(
                        META,
                        'relative before:absolute before:-inset-y-2.5 before:inset-x-0',
                        !s.settled_at && 'border-accent-2/40 text-accent-2 hover:bg-accent-2/10',
                      )}
                    >
                      <Users aria-hidden />
                      {personName.get(s.person_id) ?? 'Someone'} {s.settled_at ? 'paid' : `owes ${formatMinor(s.amount, e.currency)}`}
                    </Badge>
                  ))}
                  {e.receipt_key && (
                    <Badge
                      variant="outline"
                      render={<a href={`/api/receipt/${e.receipt_key}`} target="_blank" rel="noopener" />}
                      className={cn(META, 'relative before:absolute before:-inset-y-2.5 before:inset-x-0 hover:text-accent-2')}
                    >
                      <Paperclip aria-hidden />Receipt
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end">
                {shared ? (
                  <span className="flex flex-col items-end" title={`Full payment ${formatAmount(e)}; the rest is owed to you`}>
                    <span className="whitespace-nowrap tabular-nums text-base font-semibold text-destructive">
                      you {signedAmount(yourShare(e, mine), e.currency, 'out')}
                    </span>
                    <span className="whitespace-nowrap tabular-nums text-xs tabular-nums text-muted-foreground">of {formatAmount(e)}</span>
                  </span>
                ) : (
                  <span className={cn('whitespace-nowrap tabular-nums text-base font-semibold', e.direction === 'out' ? 'text-destructive' : 'text-income')}>
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
