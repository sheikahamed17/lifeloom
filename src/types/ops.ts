import { z } from 'zod'

export const ENTITY_KINDS = ['widget', 'money', 'recurring', 'task', 'project', 'learning', 'note', 'category', 'budget', 'account', 'goal', 'transfer', 'insight', 'habit', 'habit_log', 'journal', 'person', 'expense_share'] as const
export const OP_TYPES = ['create', 'update', 'delete'] as const

export const OpSchema = z.object({
  id: z.string().min(1),                                       // idempotency key
  hlc: z.string().regex(/^\d{16}-\d{6}-.+$/, 'invalid HLC'),
  device_id: z.string().min(1),
  user_id: z.string().min(1),
  entity_kind: z.enum(ENTITY_KINDS),
  entity_id: z.string().min(1),
  op_type: z.enum(OP_TYPES),
  payload: z.record(z.string(), z.unknown()),
  schema_version: z.number().int().positive(),
})

export type Op = z.infer<typeof OpSchema>

// One materialized row carries field-level HLCs for LWW
export type EntityRow = {
  id: string
  user_id: string
  field_hlcs: Record<string, string>   // field name → HLC
  deleted_at: string | null            // tombstone marker (a "field" too)
  created_at: string
  updated_at: string
  [field: string]: unknown
}
