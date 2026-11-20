import { parseAmountInput } from '@/lib/parse-amount'
import type { ShareDraftRow } from '@/lib/share-edit'

/**
 * "Paid for someone?" on an imported spend: the person the owner paid for, and
 * how much of the entry they will pay back (the whole of it by default).
 * `personId` null = a new person, named by `name`, created on save.
 */
export type PaidForChoice = { personId: string | null; name: string; amountText: string }

/** Why a choice can't be saved yet: no name, no readable amount, or more than the entry. */
export type PaidForProblem = 'name' | 'amount' | 'too-much'

/** JPY has no minor unit, so its amounts are whole yen; everything else is ×100. */
const minorPerMajor = (currency: string) => (currency === 'JPY' ? 1 : 100)

/**
 * The share row a "paid for" choice implies (for `planShareChanges`), or what
 * still stops it being saved. `entryAmount` is the entry's amount in minor units.
 */
export function checkPaidFor(
  entryAmount: number,
  currency: string,
  choice: PaidForChoice,
): { ok: true; rows: ShareDraftRow[] } | { ok: false; problem: PaidForProblem } {
  const name = choice.name.trim()
  if (!name) return { ok: false, problem: 'name' }
  const hundredths = parseAmountInput(choice.amountText)   // the typed major amount × 100
  if (!hundredths) return { ok: false, problem: 'amount' }
  const amount = Math.round((hundredths * minorPerMajor(currency)) / 100)
  if (amount <= 0) return { ok: false, problem: 'amount' }
  if (amount > entryAmount) return { ok: false, problem: 'too-much' }
  return { ok: true, rows: [{ person_id: choice.personId, name, amount }] }
}

/** Minor units as the text an amount field shows and `checkPaidFor` reads back. */
export function amountInputText(minor: number, currency: string): string {
  return minor > 0 ? String(minor / minorPerMajor(currency)) : ''
}
