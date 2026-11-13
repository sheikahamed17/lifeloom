'use client'

import { useEffect, useMemo, useState } from 'react'
import { Mail, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CategoryPicker } from '@/components/category-picker'
import { EntryTimestamp } from '@/components/entry-timestamp'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useMoneyRowActions } from '@/hooks/use-money-row-actions'
import { reviewQueue } from '@/lib/review-queue'
import { signedAmount } from '@/lib/capture-feedback'
import { cn } from '@/lib/utils'

const SHOWN = 4

/**
 * "Needs you": email and SMS imports that still want a category or an account,
 * at the top of Money home (owner decision, 13 Nov 2026). Replaces the 10 px
 * pills that used to be scattered through the list. Renders nothing when clear.
 */
export function ReviewQueue({ userId, focusId }: { userId: string; focusId?: string | null }) {
  const entries = useMoneyEntries(userId)
  const { setCategory, linkCard, activeAccounts } = useMoneyRowActions(userId)
  const items = useMemo(() => reviewQueue(entries, activeAccounts.length), [entries, activeAccounts.length])
  const [open, setOpen] = useState<{ id: string; what: 'category' | 'account' } | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [handledFocus, setHandledFocus] = useState<string | null>(null)

  // Push deep-link (/app?categorize=<id>): open that entry's picker once and bring it into view.
  if (focusId && focusId !== handledFocus && items.some(i => i.entry.id === focusId)) {
    setHandledFocus(focusId)
    setOpen({ id: focusId, what: 'category' })
    if (items.findIndex(i => i.entry.id === focusId) >= SHOWN) setShowAll(true)
  }
  useEffect(() => {
    if (!handledFocus) return
    requestAnimationFrame(() => document.getElementById(`review-${handledFocus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  }, [handledFocus])

  if (items.length === 0) return null
  const visible = showAll ? items : items.slice(0, SHOWN)

  return (
    <section aria-labelledby="needs-you-heading" className="glass flex flex-col gap-1 rounded-2xl p-4">
      <h2 id="needs-you-heading" className="text-sm font-semibold">
        Needs you <span className="font-normal text-muted-foreground">· {items.length}</span>
      </h2>
      <ul className="flex flex-col divide-y divide-white/10">
        {visible.map(({ entry: e, needsCategory, cardLast4 }) => {
          const SourceIcon = e.source === 'sms' ? MessageSquare : Mail
          const isOpen = (what: 'category' | 'account') => open?.id === e.id && open.what === what
          const toggle = (what: 'category' | 'account') => setOpen(isOpen(what) ? null : { id: e.id, what })
          return (
            <li key={e.id} id={`review-${e.id}`} className="flex flex-col gap-2 py-3 last:pb-0">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.description || e.merchant || 'Imported entry'}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <SourceIcon className="size-3.5" aria-hidden />
                    <span className="sr-only">{e.source === 'sms' ? 'From SMS,' : 'From email,'}</span>
                    <EntryTimestamp occurredAt={e.occurred_at} className="tabular-nums" />
                  </p>
                </div>
                <span className={cn('whitespace-nowrap font-mono text-sm font-medium tabular-nums', e.direction === 'out' ? 'text-destructive' : 'text-income')}>
                  {signedAmount(e.amount, e.currency, e.direction)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {needsCategory && (
                  <Button variant="outline" size="sm" aria-expanded={isOpen('category')} onClick={() => toggle('category')}>
                    Set category
                  </Button>
                )}
                {cardLast4 && (
                  <Button variant="outline" size="sm" aria-expanded={isOpen('account')} onClick={() => toggle('account')}>
                    Which account is •{cardLast4}?
                  </Button>
                )}
              </div>
              {isOpen('category') && (
                <CategoryPicker
                  userId={userId}
                  kind={e.direction === 'out' ? 'spend' : 'income'}
                  selectedId={e.category_id}
                  onSelect={(id, name) => { setOpen(null); void setCategory(e, id, name) }}
                />
              )}
              {isOpen('account') && cardLast4 && (
                <div role="group" aria-label={`Account for card ending ${cardLast4}`} className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">Lifeloom will remember this card for its future alerts.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeAccounts.map(acc => (
                      <Button key={acc.id} variant="outline" size="sm" onClick={() => { setOpen(null); void linkCard(e, cardLast4, acc) }}>
                        {acc.icon && <span aria-hidden="true">{acc.icon}</span>}{acc.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {items.length > SHOWN && (
        <button
          type="button"
          onClick={() => setShowAll(s => !s)}
          className="mt-1 min-h-11 self-start rounded-lg px-2 text-sm text-accent-2 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent-2"
        >
          {showAll ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </section>
  )
}
