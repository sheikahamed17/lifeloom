'use client'

import { useCallback } from 'react'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useAccounts } from '@/hooks/use-accounts'
import { useUndo } from '@/components/providers/undo-provider'
import { accountTokens, addHintDigits, planAccountBackfill } from '@/lib/account-match'
import { tagEntries, untagEntries } from '@/lib/account-autotag'
import { db, type AccountRow, type MoneyEntryRow } from '@/lib/dexie'
import { applyShareRows } from '@/lib/share-apply'
import { formatMinor } from '@/lib/currency'
import type { ShareDraftRow } from '@/lib/share-edit'
import { withMatchName } from '@/lib/people-match'
import { resurrectPayload } from '@/lib/undo-delete'

/**
 * The fixes an imported entry can need, shared by the Needs-you queue and
 * anything else that resolves one: set its category, tie the card its alert
 * names to an account (learning the digits so the next alert tags itself), or
 * record that it was paid for someone who will pay it back.
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

  // "Paid for someone": the person (created when new) owes `rows[0].amount` of
  // this entry. Undo removes the share it created; a new person stays (harmless,
  // and the People page can archive them).
  const paidFor = useCallback(async (e: MoneyEntryRow, rows: ShareDraftRow[]) => {
    try {
      const plan = await applyShareRows(userId, e.id, rows)
      pushPullOnce({ userId }).catch(err => console.error('sync', err))
      if (!plan || plan.creates.length === 0) return
      const row = rows[0]
      undo.push(`${row.name} owes you ${formatMinor(row.amount ?? 0, e.currency)}`, async () => {
        for (const c of plan.creates) {
          await applyLocalOp(await generateOp({ entity_kind: 'expense_share', entity_id: c.entity_id, op_type: 'delete', payload: {}, user_id: userId }))
        }
        pushPullOnce({ userId }).catch(err => console.error('sync', err))
      })
    } catch (err) {
      console.error('paid for', err)
      undo.push('Couldn’t save who owes you. Try again.')
    }
  }, [userId, undo])

  // A repayment: money in from `who` (or, on an `out` entry, their money given
  // back). Tags the entry, creates the person when new, and optionally remembers
  // the bank's wording of their name so the next credit is suggested exactly.
  // Undo untags the entry and restores the remembered names.
  const markRepayment = useCallback(async (e: MoneyEntryRow, who: RepaymentPick) => {
    try {
      let personId = who.personId
      const name = who.name.trim()
      if (!personId) {
        personId = crypto.randomUUID()
        await applyLocalOp(await generateOp({ entity_kind: 'person', entity_id: personId, op_type: 'create', payload: { name, is_archived: 0 }, user_id: userId }))
      }
      const person = await db.people.get(personId)
      const before = person?.match_names ?? null
      const learned = who.remember ? withMatchName(before, who.remember) : null
      if (learned) {
        await applyLocalOp(await generateOp({ entity_kind: 'person', entity_id: personId, op_type: 'update', payload: { match_names: learned }, user_id: userId }))
      }
      const previous = e.settles_person_id ?? null
      await applyLocalOp(await generateOp({ entity_kind: 'money', entity_id: e.id, op_type: 'update', payload: { settles_person_id: personId }, user_id: userId }))
      // The same money recorded by hand earlier: this bank entry replaces it.
      const found = who.replaces ? await db.money_entries.get(who.replaces) : undefined
      const twin = found && !found.deleted_at ? found : undefined
      if (twin) await applyLocalOp(await generateOp({ entity_kind: 'money', entity_id: twin.id, op_type: 'delete', payload: {}, user_id: userId }))
      pushPullOnce({ userId }).catch(err => console.error('sync', err))
      const amount = formatMinor(e.amount, e.currency)
      const id = personId
      undo.push(e.direction === 'in' ? `${amount} from ${name} · counted as paying you back` : `${amount} back to ${name}`, async () => {
        await applyLocalOp(await generateOp({ entity_kind: 'money', entity_id: e.id, op_type: 'update', payload: { settles_person_id: previous }, user_id: userId }))
        if (twin) await applyLocalOp(await generateOp({ entity_kind: 'money', entity_id: twin.id, op_type: 'update', payload: resurrectPayload('money', twin), user_id: userId }))
        if (learned && (await db.people.get(id))?.match_names === learned) {
          await applyLocalOp(await generateOp({ entity_kind: 'person', entity_id: id, op_type: 'update', payload: { match_names: before }, user_id: userId }))
        }
        pushPullOnce({ userId }).catch(err => console.error('sync', err))
      })
    } catch (err) {
      console.error('mark repayment', err)
      undo.push('Couldn’t save the repayment. Try again.')
    }
  }, [userId, undo])

  return { setCategory, linkCard, paidFor, markRepayment, activeAccounts }
}

/**
 * Who a repayment is with. `personId` null = a new person named `name`;
 * `remember` = the bank's wording to learn; `replaces` = a by-hand repayment of
 * the same money that this bank entry takes the place of (it's removed).
 */
export type RepaymentPick = { personId: string | null; name: string; remember: string | null; replaces?: string | null }
