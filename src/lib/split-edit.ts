import { isSplitValid, type Allocation } from '@/lib/split-transaction'

/** The fields of a money draft that a split needs; mirrors the create path. */
export type SplitSource = {
  amount: number
  currency: string
  direction: 'in' | 'out'
  description?: string | null
  merchant?: string | null
  tags?: string[]
  occurred_at: string
  source: string
  raw_input?: string | null
  receipt_key?: string | null
  account_id?: string | null
  split_group_id?: string | null
}

export type SplitEditPlan = {
  groupId: string
  /** The existing entry becomes the first part (keeps its id, receipt, history). */
  update: { entity_id: string; payload: Record<string, unknown> }
  /** Every further part is a new entry in the same group. */
  creates: { entity_id: string; payload: Record<string, unknown> }[]
}

/**
 * Split an ALREADY SAVED money entry across several categories.
 *
 * The create path stores a split as N ordinary entries sharing a
 * `split_group_id`. Editing keeps that shape: the saved entry is updated to the
 * first allocation (so its id, receipt, source and history survive and every
 * other device sees an update rather than a delete + N creates), and the
 * remaining allocations become new entries in the same group. If the entry is
 * already part of a split, the new parts join its group instead of starting a
 * second one.
 *
 * Throws when the allocations don't form a valid split of `final.amount`, like
 * the chip's Confirm button is disabled for.
 */
export function planSplitOfExisting(args: {
  entryId: string
  final: SplitSource
  allocations: Allocation[]
  newId: () => string
}): SplitEditPlan {
  const { entryId, final, allocations, newId } = args
  if (!isSplitValid(final.amount, allocations)) {
    throw new Error('allocations must have ≥2 positive parts that sum to the entry amount')
  }
  const groupId = final.split_group_id || newId()
  const [first, ...rest] = allocations

  const shared = {
    currency: final.currency,
    direction: final.direction,
    description: final.description ?? null,
    merchant: final.merchant ?? null,
    tags: final.tags ?? [],
    occurred_at: final.occurred_at,
    account_id: final.account_id ?? null,
    split_group_id: groupId,
  }

  return {
    groupId,
    update: {
      entity_id: entryId,
      payload: { ...shared, amount: first.amount, category_id: first.category_id ?? null },
    },
    creates: rest.map(alloc => ({
      entity_id: newId(),
      payload: {
        ...shared,
        amount: alloc.amount,
        category_id: alloc.category_id ?? null,
        source: final.source,
        raw_input: final.raw_input ?? null,
        recurring_rule_id: null,
        receipt_key: final.receipt_key ?? null,
      },
    })),
  }
}
