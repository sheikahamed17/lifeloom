export type DefaultableAccount = {
  id: string
  is_default?: number
  is_archived: number
  deleted_at: string | null
  updated_at: string
  field_hlcs?: Record<string, string>
}

// Newer star wins: compare the is_default field's own HLC (zero-padded, so it
// sorts as a string) — updated_at also moves on unrelated edits like a new hint.
function starredLater(a: DefaultableAccount, b: DefaultableAccount): boolean {
  const ha = a.field_hlcs?.is_default
  const hb = b.field_hlcs?.is_default
  return ha && hb ? ha > hb : a.updated_at > b.updated_at
}

/**
 * The default account's id, or null. Only an active (non-archived, non-deleted)
 * starred account counts. If two devices each starred a different account before
 * syncing, the most recently starred one wins.
 */
export function pickDefaultAccountId(accounts: DefaultableAccount[]): string | null {
  let best: DefaultableAccount | null = null
  for (const acc of accounts) {
    if (acc.is_default !== 1 || acc.is_archived === 1 || acc.deleted_at) continue
    if (!best || starredLater(acc, best)) best = acc
  }
  return best?.id ?? null
}

/**
 * The account a money chip should show/save. A new entry with no account starts
 * on the default; an account the draft already carries, an explicit choice in
 * the chip (including "No account"), or editing an existing entry all win over it.
 */
export function resolveDraftAccountId(args: {
  draftAccountId: string | null | undefined
  touched: boolean
  isEdit: boolean
  defaultId: string | null
}): string | null {
  if (args.draftAccountId) return args.draftAccountId
  if (args.touched || args.isEdit) return null
  return args.defaultId
}

/**
 * The account updates for tapping the ★ on `targetId`. Tapping the account
 * shown as default (per pickDefaultAccountId) clears every star; tapping any
 * other account stars it and un-stars the rest (archived ones included, so a
 * later restore can't resurrect a second default). Deciding by the SHOWN default
 * — not the raw flag — keeps one tap = one visible change after a two-device
 * double-star.
 */
export function defaultToggleUpdates(
  accounts: DefaultableAccount[],
  targetId: string,
): Array<{ id: string; is_default: 0 | 1 }> {
  const othersStarred = accounts
    .filter(acc => acc.id !== targetId && acc.is_default === 1 && !acc.deleted_at)
    .map(acc => ({ id: acc.id, is_default: 0 as const }))
  if (pickDefaultAccountId(accounts) === targetId) return [{ id: targetId, is_default: 0 }, ...othersStarred]
  return [{ id: targetId, is_default: 1 }, ...othersStarred]
}
