import { z } from 'zod'

export const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY', 'AUD', 'CAD'] as const
export type Currency = typeof SUPPORTED_CURRENCIES[number]

export const MoneyPayloadSchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  direction: z.enum(['out', 'in']),
  category_id: z.string().min(1).nullable().optional(),
  description: z.string().max(120).nullable().optional(),
  occurred_at: z.string().datetime(),
  source: z.enum(['voice', 'manual', 'recurring', 'receipt', 'sms', 'email']),
  receipt_key: z.string().min(1).nullable().optional(),
  raw_input: z.string().nullable().optional(),
  recurring_rule_id: z.string().min(1).nullable().optional(),
  merchant: z.string().max(120).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  account_id: z.string().min(1).nullable().optional(),
  split_group_id: z.string().min(1).nullable().optional(),
  // Set → this entry is a repayment with that person (in: they paid you; out: you
  // gave their money back). Never income or spending; offsets what they owe.
  settles_person_id: z.string().min(1).nullable().optional(),
})

export type MoneyPayload = z.infer<typeof MoneyPayloadSchema>
