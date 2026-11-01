'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SwipeRow } from '@/components/swipe-row'
import { CategoryPicker } from '@/components/category-picker'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useCategories } from '@/hooks/use-categories'
import { useAllCategories } from '@/hooks/use-all-categories'
import { useAllAccounts } from '@/hooks/use-all-accounts'
import { useAccounts } from '@/hooks/use-accounts'
import { accountTokens, addHintDigits, extractAlertIdentifiers, planAccountBackfill } from '@/lib/account-match'
import { tagEntries, untagEntries } from '@/lib/account-autotag'
import { useUndo } from '@/components/undo-provider'
import { resurrectPayload } from '@/lib/undo-delete'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { currencySymbol } from '@/lib/currency'
import { convertViaRates } from '@/lib/fx'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { EntryTimestamp } from '@/components/entry-timestamp'
import { filterSortMoney } from '@/lib/money-filter-sort'
import { makeCategoryResolver } from '@/lib/category-resolve'
import { groupBySplit } from '@/lib/split-group'
import { cn } from '@/lib/utils'
import { db, type AccountRow, type MoneyEntryRow } from '@/lib/dexie'
import type { MoneyFilter, MoneySort } from '@/lib/money-filter-sort'

type Props = { userId: string; onEdit?: (row: MoneyEntryRow) => void; categorizeId?: string | null; filter?: MoneyFilter; sort?: MoneySort }

export function MoneyList({ userId, onEdit, categorizeId, filter, sort }: Props) {
  const entries = useMoneyEntries(userId)
  const categories = useCategories(userId)
  const allCats = useAllCategories(userId)
  const allAccounts = useAllAccounts(userId)
  const activeAccounts = useAccounts(userId)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const undo = useUndo()
  const router = useRouter()
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [pickingId, setPickingId] = useState<string | null>(null)
  const handledCategorizeRef = useRef<string | null>(null)
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])
  const [expandedFx, setExpandedFx] = useState<string | null>(null)

  const categoryById = useMemo(
    () => new Map(categories.map(c => [c.id, c])),
    [categories],
  )

  const accountById = useMemo(
    () => new Map(allAccounts.map(a => [a.id, a])),
    [allAccounts],
  )

  const resolve = useMemo(
    () => makeCategoryResolver(allCats.map(c => ({ id: c.id, name: c.name, icon: c.icon, kind: c.kind }))),
    [allCats],
  )

  const shown = useMemo(() => {
    if (!filter || !sort) return entries
    return filterSortMoney(entries, filter, sort, resolve)
  }, [entries, filter, sort, resolve])

  // Untagged SMS/email rows whose alert names a card/account number → the last-4
  // for the "•5872 — which account?" pill.
  const unknownCardById = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of shown) {
      if (e.account_id || !e.raw_input || (e.source !== 'sms' && e.source !== 'email')) continue
      const last4 = extractAlertIdentifiers(e.raw_input)[0]
      if (last4) m.set(e.id, last4)
    }
    return m
  }, [shown])

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

  // Push deep-link: open a specific row's inline category picker once + scroll to it.
  useEffect(() => {
    if (categorizeId && handledCategorizeRef.current !== categorizeId) {
      handledCategorizeRef.current = categorizeId
      setPickingId(categorizeId)
      requestAnimationFrame(() => {
        document.getElementById(`pulse-row-${categorizeId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
    }
  }, [categorizeId])

  async function deleteEntry(e: MoneyEntryRow) {
    const op = await generateOp({
      entity_kind: 'money', entity_id: e.id,
      op_type: 'delete', payload: {},
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))

    undo.push(
      `Deleted ${formatAmount(e)}`,
      async () => {
        const undoOp = await generateOp({
          entity_kind: 'money', entity_id: e.id,
          op_type: 'update', payload: resurrectPayload('money', e),
          user_id: userId,
        })
        await applyLocalOp(undoOp)
        pushPullOnce({ userId }).catch(err => console.error('sync', err))
      },
    )
  }

  async function setCategory(e: MoneyEntryRow, categoryId: string) {
    const op = await generateOp({
      entity_kind: 'money', entity_id: e.id,
      op_type: 'update', payload: { category_id: categoryId },
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    setPickingId(null)
  }

  // Tag this entry to `acc`, remember `last4` as one of acc's hints (unless its
  // name/hints already carry it), then retag every other untagged alert that the
  // learned hint now matches — so the next email from this card is automatic.
  // The toast says what actually happened and undoes all of it.
  async function linkCard(e: MoneyEntryRow, last4: string, acc: AccountRow) {
    setLinkingId(null)
    try {
      const alreadyKnown = accountTokens(acc).digits.includes(last4)
      const nextHints = alreadyKnown ? null : addHintDigits(acc.match_hints, last4)
      let learned = acc
      if (nextHints) {
        await applyLocalOp(await generateOp({
          entity_kind: 'account', entity_id: acc.id,
          op_type: 'update', payload: { match_hints: nextHints },
          user_id: userId,
        }))
        learned = { ...acc, match_hints: nextHints }
      }
      const others = planAccountBackfill(entries, activeAccounts.map(a => (a.id === acc.id ? learned : a)))
        .filter(t => t.id !== e.id && t.account_id === acc.id)
      const tags = [{ id: e.id, account_id: acc.id }, ...others]
      const more = Math.max(0, (await tagEntries(userId, tags)) - 1)

      // Future alerts auto-tag only if the digits were saved AND no other account claims them (a tie → untagged).
      const claimedElsewhere = activeAccounts.some(a => a.id !== acc.id && accountTokens(a).digits.includes(last4))
      const auto = (alreadyKnown || nextHints !== null) && !claimedElsewhere
      undo.push(
        auto
          ? `•${last4} → ${acc.name}${more ? ` (+${more} more)` : ''}`
          : `Tagged to ${acc.name} — future •${last4} alerts won't auto-tag`,
        async () => {
          // Restore the hints only if nothing else has changed them since.
          if (nextHints && (await db.accounts.get(acc.id))?.match_hints === nextHints) {
            await applyLocalOp(await generateOp({
              entity_kind: 'account', entity_id: acc.id,
              op_type: 'update', payload: { match_hints: acc.match_hints },
              user_id: userId,
            }))
          }
          await untagEntries(userId, tags)
        },
      )
    } catch (err) {
      console.error('link card', err)
    }
  }

  async function deleteGroup(parts: MoneyEntryRow[]) {
    for (const p of parts) {
      const op = await generateOp({ entity_kind: 'money', entity_id: p.id, op_type: 'delete', payload: {}, user_id: userId })
      await applyLocalOp(op)
    }
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    undo.push(
      `Deleted split (${parts.length} parts)`,
      async () => {
        for (const p of parts) {
          const undoOp = await generateOp({ entity_kind: 'money', entity_id: p.id, op_type: 'update', payload: resurrectPayload('money', p), user_id: userId })
          await applyLocalOp(undoOp)
        }
        pushPullOnce({ userId }).catch(err => console.error('sync', err))
      },
    )
  }

  return (
    <ul className="flex flex-col gap-2">
        {groups.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">
            {filter && (filter.categoryName || filter.source || filter.direction || filter.from || filter.to)
              ? 'No entries match this filter.'
              : 'No entries yet. Tap the mic above (Phase 1.3) or type below.'}
          </li>
        )}
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
                    className="flex flex-1 flex-col items-start min-w-0 text-left focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
                  >
                    <span className="mb-1 inline-flex items-center gap-1 rounded-xl bg-white/8 px-2 py-1 text-xs text-muted-foreground">
                      🧩 {g.parts.length}-way split{first.merchant ? ` · ${first.merchant}` : ''}
                    </span>
                    <span className="text-xs text-muted-foreground">{open ? '▾ hide categories' : '▸ show categories'}</span>
                    <div className="mt-1"><EntryTimestamp occurredAt={first.occurred_at} /></div>
                  </button>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`font-mono tabular-nums text-sm font-medium whitespace-nowrap ${first.direction === 'out' ? 'text-destructive' : 'text-income'}`}>
                      {first.direction === 'out' ? '-' : '+'}{currencySymbol(first.currency)}{(g.total / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-[44px] px-2 text-xs"
                      aria-label={`Delete split (${g.parts.length} parts)`}
                      onClick={() => deleteGroup(g.parts)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {open && (
                  <ul className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2">
                    {g.parts.map(p => {
                      const pc = p.category_id ? categoryById.get(p.category_id) : undefined
                      return (
                        <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex items-center gap-1 min-w-0">
                            <span>{pc?.icon ?? ''}</span>
                            <span className="truncate text-muted-foreground">{pc?.name ?? 'Uncategorized'}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="font-mono tabular-nums">{currencySymbol(p.currency)}{(p.amount / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            {onEdit && (
                              <button
                                type="button"
                                aria-label={`Edit ${pc?.name ?? 'split part'}`}
                                onClick={() => onEdit(p)}
                                className="min-h-[44px] flex items-center text-muted-foreground hover:text-accent-2 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
                              >
                                <Pencil className="w-3 h-3" />
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
          const cat = e.category_id ? categoryById.get(e.category_id) : undefined
          const acc = e.account_id ? accountById.get(e.account_id) : undefined
          const accName = acc ? (acc.icon ? `${acc.icon} ${acc.name}` : acc.name) : (e.account_id ? 'Unknown account' : null)
          const cardLast4 = unknownCardById.get(e.id)
          return (
            <li key={e.id} id={`pulse-row-${e.id}`} className="relative">
              <SwipeRow
                isOpen={openId === e.id}
                onOpenChange={o => setOpenId(o ? e.id : null)}
                onLongPress={() => { setPickingId(null); setLinkingId(null); setMenuFor(e.id) }}
                onDelete={() => deleteEntry(e)}
                deleteLabel={`Delete entry: ${e.description || formatAmount(e)}`}
                className="glass-soft flex items-start justify-between gap-3 rounded-2xl p-3 text-sm transition-colors hover:bg-white/8"
              >
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5 w-fit">
                    {cat && (
                      <div className="inline-flex items-center gap-1 rounded-xl bg-white/8 px-2 py-1 text-xs">
                        <span>{cat.icon ?? ''}</span>
                        <span className="text-muted-foreground">{cat.name}</span>
                      </div>
                    )}
                    {accName && (
                      <div className="inline-flex items-center gap-1 rounded-xl bg-white/8 px-2 py-1 text-xs">
                        <span className="text-muted-foreground">{accName}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-sm md:text-base font-medium text-foreground">
                    {e.description || e.merchant || (cat ? cat.name : 'Uncategorized')}
                  </div>
                  <div className="flex items-center gap-2">
                    {e.description && cat && (
                      <span className="text-xs text-muted-foreground">{cat.name}</span>
                    )}
                    {e.merchant && e.merchant !== (e.description || cat?.name) && (
                      <span className="text-xs text-muted-foreground">· {e.merchant}</span>
                    )}
                  </div>
                  {(e.tags?.length ?? 0) > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(e.tags ?? []).map(tag => (
                        <span
                          key={tag}
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                            'bg-white/10 text-muted-foreground border border-white/20',
                          )}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <EntryTimestamp occurredAt={e.occurred_at} />
                    {e.currency !== prefs.primary_currency && (
                      <button
                        type="button"
                        className="text-[10px] text-muted-foreground hover:text-accent-2 transition text-left focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
                        onClick={(ev) => { ev.stopPropagation(); setExpandedFx(expandedFx === e.id ? null : e.id) }}
                      >
                        {expandedFx === e.id ? (() => {
                          const conv = convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})
                          return conv
                            ? `≈ ${currencySymbol(prefs.primary_currency)}${(conv.amount / (prefs.primary_currency === 'JPY' ? 1 : 100)).toFixed(2)} at ${conv.rateDate}`
                            : 'No FX rate yet for this date'
                        })() : '≈ convert'}
                      </button>
                    )}
                    {e.receipt_key && (
                      <button
                        type="button"
                        className="text-[10px] border border-white/20 rounded-full px-1.5 py-0.5 text-muted-foreground hover:text-accent-2 hover:border-accent-2 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          window.open(`/api/receipt/${e.receipt_key}`, '_blank', 'noopener')
                        }}
                      >
                        📎 receipt
                      </button>
                    )}
                    {e.source === 'sms' && (
                      <span className="text-[10px] border border-white/20 rounded-full px-1.5 py-0.5 text-muted-foreground">
                        💳 SMS
                      </span>
                    )}
                    {e.source === 'email' && (
                      <span className="text-[10px] border border-white/20 rounded-full px-1.5 py-0.5 text-muted-foreground">
                        📧 Email
                      </span>
                    )}
                    {!e.category_id && (e.source === 'email' || e.source === 'sms') && (
                      <button
                        type="button"
                        onClick={(ev) => { ev.stopPropagation(); setMenuFor(null); setLinkingId(null); setPickingId(pickingId === e.id ? null : e.id) }}
                        aria-label={`Set category for ${e.description || formatAmount(e)}`}
                        className="relative text-[10px] border border-amber-400/40 text-amber-400 rounded-full px-1.5 py-0.5 hover:bg-amber-400/10 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none before:absolute before:-inset-x-1 before:-inset-y-3"
                      >
                        ⚠ Set category
                      </button>
                    )}
                    {cardLast4 && activeAccounts.length > 0 && (
                      <button
                        type="button"
                        onClick={(ev) => { ev.stopPropagation(); setMenuFor(null); setPickingId(null); setLinkingId(linkingId === e.id ? null : e.id) }}
                        aria-expanded={linkingId === e.id}
                        aria-label={`Card •${cardLast4}: which account?`}
                        className="relative text-[10px] border border-accent-2/40 text-accent-2 rounded-full px-1.5 py-0.5 hover:bg-accent-2/10 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none before:absolute before:-inset-x-1 before:-inset-y-3"
                      >
                        💳 •{cardLast4} — which account?
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className={`font-mono tabular-nums text-sm font-medium whitespace-nowrap ${
                    e.direction === 'out' ? 'text-destructive' : 'text-income'
                  }`}>
                    {formatAmount(e)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-[44px] px-2 text-xs"
                    aria-label={`Delete entry: ${e.description || formatAmount(e)}`}
                    onClick={() => deleteEntry(e)}
                  >
                    Delete
                  </Button>
                </div>
              </SwipeRow>

              {pickingId === e.id && (
                <div className="glass-soft mt-1 rounded-2xl p-2">
                  <CategoryPicker
                    userId={userId}
                    kind={e.direction === 'out' ? 'spend' : 'income'}
                    selectedId={e.category_id ?? null}
                    onSelect={(id) => setCategory(e, id)}
                  />
                  <button
                    type="button"
                    onClick={() => setPickingId(null)}
                    className="mt-1 px-2 py-1 min-h-[44px] text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {linkingId === e.id && cardLast4 && (
                <div className="glass-soft mt-1 rounded-2xl p-2" role="group" aria-label={`Account for card ending ${cardLast4}`}>
                  <p className="px-2 pb-1 text-xs text-muted-foreground">
                    Which account is •{cardLast4}? Pulse will remember it for this card’s future alerts.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeAccounts.map(acc => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => linkCard(e, cardLast4, acc)}
                        className="min-h-[44px] rounded-xl bg-white/8 px-3 text-xs hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                      >
                        {acc.icon ? `${acc.icon} ${acc.name}` : acc.name}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLinkingId(null)}
                    className="mt-1 px-2 py-1 min-h-[44px] text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {menuFor === e.id && (
                <div className="absolute right-2 top-full z-20 mt-1 flex flex-col rounded-md border bg-background shadow">
                  {onEdit && (
                    <button
                      type="button"
                      aria-label={`Edit entry: ${e.description || formatAmount(e)}`}
                      className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                      onClick={() => { onEdit(e); setMenuFor(null) }}
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Delete entry: ${e.description || formatAmount(e)}`}
                    className="flex items-center gap-2 px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                    onClick={() => { deleteEntry(e); setMenuFor(null) }}
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                  {e.recurring_rule_id && (
                    <button
                      type="button"
                      className="px-3 py-2 min-h-[44px] text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                      onClick={() => { router.push('/settings/recurring'); setMenuFor(null) }}
                    >
                      Edit recurring rule
                    </button>
                  )}
                  <button
                    type="button"
                    className="px-3 py-2 min-h-[44px] text-xs text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                    onClick={() => setMenuFor(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
  )
}

function formatAmount(e: MoneyEntryRow): string {
  const major = (e.amount / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
  return `${e.direction === 'out' ? '-' : '+'}${currencySymbol(e.currency)}${major}`
}
