'use client'

import { useCallback } from 'react'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useAccounts } from '@/hooks/use-accounts'
import { useUndo } from '@/components/undo-provider'
import { accountTokens, addHintDigits, planAccountBackfill } from '@/lib/account-match'
import { tagEntries, untagEntries } from '@/lib/account-autotag'
import { db, type AccountRow, type MoneyEntryRow } from '@/lib/dexie'

/**
 * The two fixes an imported entry can need, shared by the Needs-you queue and
 * anything else that resolves one: set its category, or tie the card its alert
 * names to an account (learning the digits so the next alert tags itself).
 */
export function useMoneyRowActions(userId: string) {
  const entries = useMoneyEntries(userId)
  const activeAccounts = useAccounts(userId)
  const undo = useUndo()

  const setCategory = useCallback(async (e: MoneyEntryRow, categoryId: string, categoryName?: string) => {
    const previous = e.category_id
    await applyLocalOp(await generateOp({
      entity_kind: 'money', entity_id: e.id,
      op_type: 'update', payload: { category_id: categoryId },
      user_id: userId,
    }))
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    undo.push(categoryName ? `Filed under ${categoryName}` : 'Category set', async () => {
      await applyLocalOp(await generateOp({
        entity_kind: 'money', entity_id: e.id,
        op_type: 'update', payload: { category_id: previous },
        user_id: userId,
      }))
      pushPullOnce({ userId }).catch(err => console.error('sync', err))
    })
  }, [userId, undo])

  // Tag this entry to `acc`, remember `last4` as one of acc's hints (unless its
  // name/hints already carry it), then retag every other untagged alert that the
  // learned hint now matches — so the next email from this card is automatic.
  // The toast says what actually happened and undoes all of it.
  const linkCard = useCallback(async (e: MoneyEntryRow, last4: string, acc: AccountRow) => {
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
          : `Tagged to ${acc.name}. Future •${last4} alerts won’t auto-tag`,
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
  }, [userId, entries, activeAccounts, undo])

  return { setCategory, linkCard, activeAccounts }
}
