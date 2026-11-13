import type { ChipDraft } from '@/components/capture/confirmation-chip'
import type { Currency } from '@/lib/op-schemas/money'

/** A blank ConfirmationChip draft for manual "+ Add" — kind decided by the active tab. */
export function blankDraftForKind(
  kind: 'money' | 'task' | 'learning' | 'note',
  primaryCurrency: string,
  nowIso: string,
): ChipDraft {
  switch (kind) {
    case 'task':
      return { kind: 'task', title: '', due_at: null, priority: 'medium', tags: [], project_id: null, source: 'manual', raw_input: null }
    case 'learning':
      return { kind: 'learning', text: '', tags: [], attribution: null, occurred_at: nowIso, source: 'manual' }
    case 'note':
      return { kind: 'note', body: '', title: null, tags: [], occurred_at: nowIso, source: 'manual' }
    case 'money':
    default:
      return { kind: 'money', amount: 0, currency: primaryCurrency as Currency, direction: 'out', category_id: null, description: null, occurred_at: nowIso, source: 'manual', raw_input: null, merchant: null, tags: [], account_id: null }
  }
}
