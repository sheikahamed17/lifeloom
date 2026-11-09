import { z } from 'zod'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'

export const MoneyAgentResponseSchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  direction: z.enum(['out', 'in']),
  category_name: z.string().min(1).nullable(),
  description: z.string().max(120).nullable(),
  occurred_at: z.string().datetime(),
  // People who owe part of this ("split with Arun"). amount null = equal split,
  // resolved by the chip — the model never does the arithmetic.
  shared_with: z.array(z.object({
    name: z.string().min(1).max(60),
    amount: z.number().int().positive().nullable(),
  })).max(10).optional().default([]),
})

export type MoneyAgentResponse = z.infer<typeof MoneyAgentResponseSchema>
