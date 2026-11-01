export type DefaultableAccount = {
  id: string
  is_default?: number
  is_archived: number
  deleted_at: string | null
  updated_at: string
}

/**
 * The default account's id, or null. Only an active (non-archived, non-deleted)
 * starred account counts. If two devices each starred a different account before
 * syncing, the most recently updated one wins.
 */
export function pickDefaultAccountId(accounts: DefaultableAccount[]): string | null {
  let best: DefaultableAccount | null = null
  for (const acc of accounts) {
    if (acc.is_default !== 1 || acc.is_archived === 1 || acc.deleted_at) continue
    if (!best || acc.updated_at > best.updated_at) best = acc
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
 * The account updates for tapping the ★ on `targetId`: toggles it, and when
 * starring, un-stars every other starred account (archived ones included, so a
 * later restore can't resurrect a second default).
 */
export function defaultToggleUpdates(
  accounts: DefaultableAccount[],
  targetId: string,
): Array<{ id: string; is_default: 0 | 1 }> {
  const target = accounts.find(acc => acc.id === targetId)
  if (target?.is_default === 1) return [{ id: targetId, is_default: 0 }]
  return [
    { id: targetId, is_default: 1 },
    ...accounts
      .filter(acc => acc.id !== targetId && acc.is_default === 1 && !acc.deleted_at)
      .map(acc => ({ id: acc.id, is_default: 0 as const })),
  ]
}
