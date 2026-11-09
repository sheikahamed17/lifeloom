import { z } from 'zod'

// One person's part of one `out` money entry, in the entry's currency (minor
// units). `settled_at` + `settled_account_id` record the repayment: it is a
// state change on the debt, not a money entry, so it never shows as income.
export const ExpenseSharePayloadSchema = z.object({
  money_entry_id: z.string().min(1),
  person_id: z.string().min(1),
  amount: z.number().int().positive(),
  settled_at: z.string().datetime().nullable().optional(),
  settled_account_id: z.string().nullable().optional(),
  note: z.string().max(200).nullable().optional(),
})

export type ExpenseSharePayload = z.infer<typeof ExpenseSharePayloadSchema>
