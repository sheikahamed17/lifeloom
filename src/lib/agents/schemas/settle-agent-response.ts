import { z } from 'zod'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'

// "Arun paid me 10000" → who paid, how much. The client turns this into a
// settlement of that person's outstanding shares (whole shares, oldest first,
// exact match only) — the model never decides which debt it was.
export const SettleAgentResponseSchema = z.object({
  person_name: z.string().min(1).max(60),
  amount: z.number().int().positive(),   // minor units
  currency: z.enum(SUPPORTED_CURRENCIES),
})

export type SettleAgentResponse = z.infer<typeof SettleAgentResponseSchema>
