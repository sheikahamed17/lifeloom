import { z } from 'zod'

/**
 * Metrics JSON structure validated before metrics field serializes to string.
 * The LLM/aggregation system populates this; it is then JSON.stringify'd into the metrics field.
 */
export const InsightMetricsSchema = z.object({
  currency: z.string(),
  spend_total: z.number(),
  income_total: z.number(),
  top_categories: z.array(
    z.object({
      name: z.string(),
      amount: z.number(),
    })
  ),
  tasks_completed: z.number().nonnegative().int(),
  tasks_created: z.number().nonnegative().int(),
  tasks_overdue: z.number().nonnegative().int(),
  skipped_currencies: z.array(z.string()),
  entry_count: z.number().nonnegative().int(),
  owed_total: z.number().nonnegative().optional(),   // shared expenses still owed to the user
})

export type InsightMetrics = z.infer<typeof InsightMetricsSchema>

export const InsightPayloadObject = z.object({
  period: z.enum(['weekly']),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  summary: z.string().min(1).max(2000),
  metrics: z.string().min(2),  // JSON-encoded string; contents must satisfy InsightMetricsSchema when parsed
})

export const InsightPayloadSchema = InsightPayloadObject.refine(
  v => v.starts_at < v.ends_at,
  { message: 'starts_at must be < ends_at' }
)

export type InsightPayload = z.infer<typeof InsightPayloadSchema>
