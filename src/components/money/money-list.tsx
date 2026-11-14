'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, Pencil, Repeat, Split, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
import { dayHeading, makeDayKeyer } from '@/components/money/month-days'
import { filterSortMoney } from '@/lib/money-filter-sort'
import { makeCategoryResolver } from '@/lib/category-resolve'
import { groupBySplit } from '@/lib/split-group'
import { signedAmount } from '@/lib/capture-feedback'
import { formatDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { MoneyEntryRow } from '@/lib/dexie'
import type { MoneyFilter, MoneySort } from '@/lib/money-filter-sort'

type Props = { userId: string; onEdit?: (row: MoneyEntryRow) => void; filter?: MoneyFilter; sort?: MoneySort }

// Quiet facts under an entry (source, tags, links): one line of small muted text, no pills.
const META = 'flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'
// A link or button inside that line. The pseudo-element keeps a 44px touch target.
const META_LINK = 'relative underline underline-offset-2 outline-none before:absolute before:-inset-y-3.5 before:inset-x-0 hover:text-foreground focus-visible:text-foreground'

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

  // Sorted by date, the list reads as a ledger: one small date heading per day.
  // Sorted by amount there are no days to group by, so each row carries its own time.
  const byDay = !sort || sort === 'date-desc' || sort === 'date-asc'
  const todayKey = useMemo(() => makeDayKeyer(prefs.tz)(new Date().toISOString()), [prefs.tz])
  const sections = useMemo(() => {
    if (!byDay) return [{ key: 'all', label: null as string | null, groups }]
    const dayKey = makeDayKeyer(prefs.tz)
    const out: { key: string; label: string | null; groups: typeof groups }[] = []
    for (const g of groups) {
      const key = dayKey(g.kind === 'split' ? g.parts[0].occurred_at : g.entry.occurred_at)
      const last = out[out.length - 1]
      if (last && last.key === key) last.groups.push(g)
      else out.push({ key, label: dayHeading(key, todayKey), groups: [g] })
    }
    return out
  }, [byDay, groups, prefs.tz, todayKey])
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
      <p className="py-3 text-sm text-muted-foreground">
        {filtered
          ? 'No entries match these filters.'
          : 'No money entries yet. Type “spent 80 on chai” above, or connect bank emails in Settings → Auto-import.'}
      </p>
    )
  }

  const renderGroup = (g: typeof groups[number]) => {
    if (g.kind === 'split') {
      const open = expandedGroups.has(g.groupId)
      const first = g.parts[0]
      const splitTitle = first.description || first.merchant || 'Split payment'
      return (
        <li key={g.groupId} id={`pulse-row-${g.groupId}`} className="border-b border-border py-3">
          <Collapsible open={open} onOpenChange={() => toggleGroup(g.groupId)}>
            <div className="flex items-center gap-3">
              <IconTile name={first.merchant || first.description} icon={Split} tone={first.direction === 'in' ? 'income' : 'default'} />
              <CollapsibleTrigger
                render={<Button variant="ghost" />}
                className="h-auto min-w-0 flex-1 flex-col items-start justify-start gap-0.5 whitespace-normal rounded-lg px-0 py-0 text-left font-normal hover:bg-transparent"
              >
                <span className="text-[15px] font-medium leading-snug">{splitTitle}</span>
                <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
                  Split {g.parts.length} ways
                  <ChevronDown className={cn('size-3.5 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
                </span>
                {!byDay && <EntryTimestamp occurredAt={first.occurred_at} />}
              </CollapsibleTrigger>
              <span className={cn('shrink-0 whitespace-nowrap text-base font-semibold tabular-nums', first.direction === 'in' && 'text-income')}>
                {signedAmount(g.total, first.currency, first.direction)}
              </span>
              <div className="-mr-3">
                <RowMenu
                  label={`Actions for ${g.parts.length}-way split`}
                  open={menuFor === g.groupId}
                  onOpenChange={o => setMenuFor(o ? g.groupId : null)}
                  items={[{ label: `Delete split (${g.parts.length} parts)`, icon: Trash2, destructive: true, onSelect: () => deleteGroup(g.parts) }]}
                />
              </div>
            </div>
            <CollapsibleContent>
              <ul className="mt-3 flex flex-col border-t border-border pl-13" aria-label="Split parts">
                {g.parts.map(p => {
                  const pc = resolve(p.category_id)
                  return (
                    <li key={p.id} className="flex min-h-11 items-center justify-between gap-2 border-b border-border text-sm last:border-b-0">
                      <span className="min-w-0 truncate text-muted-foreground">{pc?.name ?? 'Uncategorized'}</span>
                      <span className="flex shrink-0 items-center">
                        <span className="font-medium tabular-nums">{formatMinor(p.amount, p.currency)}</span>
                        {onEdit && (
                          <Button
                            variant="ghost"
                            size="icon-lg"
                            aria-label={`Edit ${pc?.name ?? 'split part'}`}
                            onClick={() => onEdit(p)}
                            className="-mr-3 text-muted-foreground hover:text-foreground"
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
    // "Food, HDFC card": category, then the merchant when the title is something else, then the account.
    const facts = [
      cat ? (cat.name !== title ? cat.name : null) : (title !== 'Uncategorized' ? 'Uncategorized' : null),
      e.merchant && e.merchant !== title ? e.merchant : null,
      acc ? acc.name : e.account_id ? 'Unknown account' : null,
    ].filter(Boolean).join(', ')
    const foreign = e.currency !== prefs.primary_currency
    const hasMeta = !byDay || (e.tags?.length ?? 0) > 0 || e.source === 'email' || e.source === 'sms' || !!e.recurring_rule_id || foreign || shared || !!e.receipt_key
    return (
      <li key={e.id} id={`pulse-row-${e.id}`} className="border-b border-border">
        <SwipeRow
          isOpen={openId === e.id}
          onOpenChange={o => setOpenId(o ? e.id : null)}
          onTap={onEdit ? () => onEdit(e) : undefined}
          onLongPress={() => setMenuFor(e.id)}
          onDelete={() => deleteEntry(e)}
          deleteLabel={`Delete ${title} ${formatAmount(e)}`}
          className="flex items-center gap-3 bg-background py-3"
        >
          <IconTile name={e.merchant || e.description || cat?.name} tone={e.direction === 'in' ? 'income' : 'default'} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-[15px] font-medium leading-snug text-foreground">{title}</p>
            {facts && <p className="text-[13px] text-muted-foreground">{facts}</p>}
            {hasMeta && (
              <div className={cn(META, 'pt-0.5')}>
                {!byDay && <EntryTimestamp occurredAt={e.occurred_at} />}
                {e.source === 'email' && <span>From email</span>}
                {e.source === 'sms' && <span>From SMS</span>}
                {e.recurring_rule_id && <span>Recurring</span>}
                {(e.tags ?? []).map(tag => <span key={tag}>#{tag}</span>)}
                {foreign && (
                  <Button
                    variant="link"
                    size="xs"
                    className={cn(META_LINK, 'h-auto whitespace-normal p-0 text-left text-xs font-normal text-muted-foreground')}
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
                  <Link
                    key={s.id}
                    href={`/settings/people#${s.person_id}`}
                    className={cn(META_LINK, !s.settled_at && 'font-medium text-foreground')}
                  >
                    {personName.get(s.person_id) ?? 'Someone'} {s.settled_at ? 'paid' : `owes ${formatMinor(s.amount, e.currency)}`}
                  </Link>
                ))}
                {e.receipt_key && (
                  <a href={`/api/receipt/${e.receipt_key}`} target="_blank" rel="noopener" className={META_LINK}>Receipt</a>
                )}
              </div>
            )}
          </div>

          {shared ? (
            <span className="flex shrink-0 flex-col items-end" title={`Full payment ${formatAmount(e)}; the rest is owed to you`}>
              <span className="whitespace-nowrap text-base font-semibold tabular-nums">
                you {signedAmount(yourShare(e, mine), e.currency, 'out')}
              </span>
              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">of {formatAmount(e)}</span>
            </span>
          ) : (
            <span className={cn('shrink-0 whitespace-nowrap text-base font-semibold tabular-nums', e.direction === 'in' && 'text-income')}>
              {formatAmount(e)}
            </span>
          )}
          <div className="-ml-1 -mr-3">
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
        </SwipeRow>
      </li>
    )
  }

  return (
    <div className="-mt-3 flex flex-col">
      {sections.map(section => (
        <div key={section.key} className="flex flex-col">
          {section.label && (
            <h3 id={`entries-day-${section.key}`} className="pb-1 pt-4 text-xs font-semibold text-muted-foreground lg:text-[13px]">
              {section.label}
            </h3>
          )}
          <ul
            className="flex flex-col"
            aria-labelledby={section.label ? `entries-day-${section.key}` : 'entries-heading'}
          >
            {section.groups.map(renderGroup)}
          </ul>
        </div>
      ))}
    </div>
  )
}
