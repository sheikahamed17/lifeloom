'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { FieldLegend, FieldSet } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { AttentionRow } from '@/components/shared/attention-row'
import { CategoryPicker } from '@/components/money/category-picker'
import { EntryTimestamp } from '@/components/money/entry-timestamp'
import { FOOT_LINK, SectionHeading } from '@/components/money/section-heading'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useMoneyRowActions } from '@/hooks/use-money-row-actions'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { reviewQueue, type ReviewItem } from '@/lib/review-queue'
import { formatMinor } from '@/lib/currency'
import { formatLocalDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AccountRow } from '@/lib/dexie'

const SHOWN = 4

type Pick = { category: { id: string; name: string } | null; account: AccountRow | null }

/**
 * "Needs you": email and SMS imports that still want a category or an account,
 * at the top of Money home (owner decision, 13 Nov 2026). Each one is a white
 * attention row with a single action; choosing opens its review below the row.
 * Renders nothing when clear.
 */
export function ReviewQueue({ userId, focusId }: { userId: string; focusId?: string | null }) {
  const entries = useMoneyEntries(userId)
  const { setCategory, linkCard, activeAccounts } = useMoneyRowActions(userId)
  const items = useMemo(() => reviewQueue(entries, activeAccounts.length), [entries, activeAccounts.length])
  const [open, setOpen] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [handledFocus, setHandledFocus] = useState<string | null>(null)

  // Push deep-link (/app?categorize=<id>): open that entry's review once and bring it into view.
  if (focusId && focusId !== handledFocus && items.some(i => i.entry.id === focusId)) {
    setHandledFocus(focusId)
    setOpen(focusId)
    if (items.findIndex(i => i.entry.id === focusId) >= SHOWN) setShowAll(true)
  }
  useEffect(() => {
    if (!handledFocus) return
    requestAnimationFrame(() => document.getElementById(`review-${handledFocus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  }, [handledFocus])

  if (items.length === 0) return null
  const shown = items.slice(0, SHOWN)
  const extra = items.slice(SHOWN)

  // Save what was chosen, then move on to the next entry in the queue (if any).
  async function save(item: ReviewItem, pick: Pick) {
    const index = items.findIndex(i => i.entry.id === item.entry.id)
    const next = items[index + 1]?.entry.id ?? null
    setOpen(next)
    if (next && index + 1 >= SHOWN) setShowAll(true)
    if (pick.category) await setCategory(item.entry, pick.category.id, pick.category.name)
    if (pick.account && item.cardLast4) await linkCard(item.entry, item.cardLast4, pick.account)
  }

  const renderItem = (item: ReviewItem, index: number) => {
    const { entry: e, needsCategory, cardLast4 } = item
    const isOpen = open === e.id
    const title = e.description || e.merchant || 'Imported entry'
    const need = needsCategory
      ? cardLast4 ? 'No category or account yet.' : 'No category yet.'
      : `Card •${cardLast4} has no account yet.`
    return (
      <li key={e.id} id={`review-${e.id}`} className={cn('rounded-2xl', isOpen && 'bg-card')}>
        <AttentionRow
          title={title}
          detail={<>{e.source === 'sms' ? 'From SMS' : 'From email'}, <EntryTimestamp occurredAt={e.occurred_at} className="tabular-nums" />. {need}</>}
          value={e.direction === 'in'
            ? <span className="text-income">+{formatMinor(e.amount, e.currency)}</span>
            : formatMinor(e.amount, e.currency)}
          action={
            <Button
              variant="outline"
              aria-expanded={isOpen}
              aria-controls={isOpen ? `review-panel-${e.id}` : undefined}
              aria-label={isOpen ? `Close ${title}` : `Choose for ${title}`}
              onClick={() => setOpen(isOpen ? null : e.id)}
            >
              {isOpen ? 'Close' : 'Choose'}
            </Button>
          }
        />
        {isOpen && (
          <ReviewEditor
            key={e.id}
            userId={userId}
            item={item}
            accounts={activeAccounts}
            hasNext={index < items.length - 1}
            onSave={pick => void save(item, pick)}
            onClose={() => setOpen(null)}
          />
        )}
      </li>
    )
  }

  return (
    <section aria-labelledby="needs-you-heading" className="flex flex-col">
      <SectionHeading
        id="needs-you-heading"
        ruled={false}
        aside={<p className="shrink-0 text-[13px] font-semibold text-warning lg:text-sm">{items.length} open</p>}
      >
        Needs you
      </SectionHeading>
      <Collapsible open={showAll} onOpenChange={setShowAll} className="flex flex-col">
        <ul className="flex flex-col gap-2 pt-2">
          {shown.map((it, i) => renderItem(it, i))}
        </ul>
        {extra.length > 0 && (
          <CollapsibleContent>
            <ul className="flex flex-col gap-2 pt-2">
              {extra.map((it, i) => renderItem(it, SHOWN + i))}
            </ul>
          </CollapsibleContent>
        )}
        {items.length > SHOWN && (
          <CollapsibleTrigger className={cn(FOOT_LINK, 'mt-1')}>
            {showAll ? 'Show fewer' : `Show all ${items.length}`}
          </CollapsibleTrigger>
        )}
      </Collapsible>
    </section>
  )
}

const LEGEND = 'mb-0 w-full border-b border-border pb-2.5 text-[17px] font-bold tracking-[-0.02em]'

/**
 * Reviewing one imported entry: the facts, then a radio-style list for each thing it
 * still needs, one primary action and one text action. Nothing is saved until Save.
 */
function ReviewEditor({ userId, item, accounts, hasNext, onSave, onClose }: {
  userId: string
  item: ReviewItem
  accounts: AccountRow[]
  hasNext: boolean
  onSave: (pick: Pick) => void
  onClose: () => void
}) {
  const { entry: e, needsCategory, cardLast4 } = item
  const { prefs } = useUserPrefs()
  const [pick, setPick] = useState<Pick>({ category: null, account: null })
  const account = e.account_id ? accounts.find(a => a.id === e.account_id) : undefined

  return (
    <div id={`review-panel-${e.id}`} className="flex flex-col gap-6 px-4 pb-4">
      <dl className="flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-3.5">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">When</dt>
          <dd className="text-[15px] font-semibold tabular-nums">{formatLocalDateTime(e.occurred_at, prefs.tz)}</dd>
        </div>
        {account && (
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{e.direction === 'out' ? 'From' : 'Into'}</dt>
            <dd className="text-[15px] font-semibold">{account.name}</dd>
          </div>
        )}
        {e.merchant && e.merchant !== (e.description || e.merchant) && (
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Merchant</dt>
            <dd className="text-[15px] font-semibold">{e.merchant}</dd>
          </div>
        )}
      </dl>

      {needsCategory && (
        <FieldSet className="min-w-0 gap-0">
          <FieldLegend className={LEGEND}>{e.direction === 'out' ? 'What was it for?' : 'What was it from?'}</FieldLegend>
          <CategoryPicker
            userId={userId}
            kind={e.direction === 'out' ? 'spend' : 'income'}
            selectedId={pick.category?.id ?? e.category_id}
            onSelect={(id, name) => setPick(p => ({ ...p, category: { id, name } }))}
          />
        </FieldSet>
      )}

      {cardLast4 && (
        <FieldSet className="min-w-0 gap-0">
          <FieldLegend className={LEGEND}>Which account is •{cardLast4}?</FieldLegend>
          <RadioGroup
            aria-label={`Account for card ending ${cardLast4}`}
            value={pick.account?.id ?? ''}
            onValueChange={id => setPick(p => ({ ...p, account: accounts.find(a => a.id === id) ?? null }))}
            className="gap-0"
          >
            {accounts.map(acc => (
              <Label
                key={acc.id}
                className={cn(
                  'min-h-13 gap-3 border-b border-border px-1 text-[15px] tracking-normal text-foreground',
                  pick.account?.id === acc.id ? 'font-semibold' : 'font-medium',
                )}
              >
                <RadioGroupItem value={acc.id} className="size-5 border-muted-foreground" />
                {acc.name}
              </Label>
            ))}
          </RadioGroup>
          <p className="pt-2.5 text-[13px] text-muted-foreground">Lifeloom will remember this card for its future alerts.</p>
        </FieldSet>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
        <Button size="lg" disabled={!pick.category && !pick.account} onClick={() => onSave(pick)}>
          {hasNext ? 'Save and show the next one' : 'Save'}
        </Button>
        <Button variant="link" onClick={onClose}>Not now</Button>
      </div>
    </div>
  )
}
