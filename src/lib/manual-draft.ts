import { blankDraftForKind } from '@/lib/blank-draft'
import type { ChipDraft } from '@/components/capture/confirmation-chip'
import type { MoneyPayload } from '@/lib/op-schemas/money'
import type { TaskPayload } from '@/lib/op-schemas/task'
import type { LearningPayload } from '@/lib/op-schemas/learning'
import type { NotePayload } from '@/lib/op-schemas/note'

/**
 * Create a manual-add draft prefilled with trimmed text.
 * Delegates to blankDraftForKind and overlays the primary text field:
 * - money → description
 * - task → title
 * - learning → text
 * - note → body
 *
 * Empty/whitespace text results in blank fields (like blankDraftForKind).
 * Sets raw_input where the draft has that field (money/task only).
 */
export function manualDraftFromText(
  kind: 'money' | 'task' | 'learning' | 'note',
  text: string,
  primaryCurrency: string,
  nowIso: string,
): ChipDraft {
  const trimmed = text.trim()
  const blank = blankDraftForKind(kind, primaryCurrency, nowIso)

  if (!trimmed) {
    return blank
  }

  switch (kind) {
    case 'money': {
      const moneyBlank = blank as MoneyPayload & { kind: 'money'; draftCategoryName?: string; receiptPreviewUrl?: string; merchant?: string | null; tags?: string[]; account_id?: string | null }
      return {
        ...moneyBlank,
        description: trimmed,
        raw_input: trimmed,
      }
    }
    case 'task': {
      const taskBlank = blank as TaskPayload & { kind: 'task' }
      return {
        ...taskBlank,
        title: trimmed,
        raw_input: trimmed,
      }
    }
    case 'learning': {
      const learningBlank = blank as LearningPayload & { kind: 'learning' }
      return {
        ...learningBlank,
        text: trimmed,
      }
    }
    case 'note': {
      const noteBlank = blank as NotePayload & { kind: 'note' }
      return {
        ...noteBlank,
        body: trimmed,
      }
    }
  }
}
