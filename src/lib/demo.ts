// Demo-mode helpers.
//
// DEMO_MODE turns a deployment into a PUBLIC, SHARED, read-mostly demo: every
// visitor is auto-authenticated as ONE fixed demo user and sees/edits the SAME
// shared data — this is NOT per-visitor isolated. That's why the reset cron
// (src/app/api/cron/demo-reset) wipes and reseeds that single shared account on
// a schedule. DEMO_MODE defaults to OFF everywhere except the demo deployment's
// own wrangler.demo.toml (`DEMO_MODE = "true"`), so production and every
// self-hoster's instance are completely unaffected.

export const DEMO_RESET_HOURS = 4

/** True only when the deployment's env sets DEMO_MODE truthy. */
export function isDemoMode(env: { DEMO_MODE?: string | boolean | null } | null | undefined): boolean {
  const v = env?.DEMO_MODE
  return v === 'true' || v === true
}

/**
 * The single fixed demo user every visitor is authenticated as. Deterministic
 * id so the seed, the reset cron, and the auto-auth all agree without a lookup.
 */
export const DEMO_USER = {
  id: 'demo-user',
  email: 'demo@pulse.local',
  name: 'Demo',
} as const

/** Suggested "try me" inputs the demo capture box surfaces. Each has a canned
 *  result below, so AI features work with ZERO Groq quota (the key is shared
 *  with production). */
export const DEMO_EXAMPLES = [
  'lunch 240',
  'coffee 120',
  'finish the report by friday',
  'idea: try deploying my own Lifeloom',
  'total spend this month',
  "what's overdue?",
] as const

export type AgentResponse = {
  transcript: string
  intent: string | null
  confidence: number
  payload: Record<string, unknown> | null
  demoLimited?: boolean
}

type Cat = { id: string; name: string; kind: 'spend' | 'income' }

// Each canned phrase maps to the SAME response shape /api/agent produces, built
// from the request's live categories + timestamp so it drops straight into the
// existing confirmation-chip / query-answer UI.
const CANNED: Record<string, (cats: Cat[], nowIso: string) => AgentResponse> = {
  'lunch 240': (cats, nowIso) => moneyDraft('lunch 240', 24000, 'Dining', 'Lunch', cats, nowIso),
  'coffee 120': (cats, nowIso) => moneyDraft('coffee 120', 12000, 'Dining', 'Coffee', cats, nowIso),
  'finish the report by friday': (_cats, nowIso) => ({
    transcript: 'finish the report by friday', intent: 'log_task', confidence: 0.95,
    payload: { kind: 'task', title: 'Finish the report', due_at: null, priority: 'normal', completed_at: null, source: 'manual', raw_input: 'finish the report by friday' },
  }),
  'idea: try deploying my own lifeloom': (_cats, nowIso) => ({
    transcript: 'idea: try deploying my own Lifeloom', intent: 'log_note', confidence: 0.95,
    payload: { kind: 'note', body: 'idea: try deploying my own Lifeloom', title: 'Deploy my own Lifeloom', tags: ['ideas'], occurred_at: nowIso, source: 'manual' },
  }),
  'total spend this month': (_cats, _nowIso) => ({
    transcript: 'total spend this month', intent: 'query_money', confidence: 0.95,
    payload: { kind: 'query_money', direction: 'out', category_name: null, mode: 'total', bucket: null, period: null },
  }),
  "what's overdue?": (_cats, _nowIso) => ({
    transcript: "what's overdue?", intent: 'query_task', confidence: 0.95,
    payload: { kind: 'query_task', status: 'overdue', period: null },
  }),
}

function moneyDraft(raw: string, amount: number, categoryName: string, description: string, cats: Cat[], nowIso: string): AgentResponse {
  const cat = cats.find(c => c.name === categoryName && c.kind === 'spend')
  return {
    transcript: raw, intent: 'log_money', confidence: 0.95,
    payload: { kind: 'money', amount, currency: 'INR', direction: 'out', category_id: cat?.id ?? null, description, occurred_at: nowIso, source: 'manual', raw_input: raw },
  }
}

/**
 * Canned agent result for a suggested demo phrase, or null when the input isn't
 * one of the examples (caller then returns a friendly demo-limited response).
 * Matching is case- and whitespace-insensitive.
 */
export function cannedAgentResponse(text: string, categories: Cat[], nowIso: string): AgentResponse | null {
  const key = text.trim().toLowerCase().replace(/\s+/g, ' ')
  const build = CANNED[key]
  return build ? build(categories, nowIso) : null
}

/** The response for AI input outside the suggested examples. */
export function demoLimitedResponse(text: string): AgentResponse {
  return { transcript: text, intent: null, confidence: 0, payload: null, demoLimited: true }
}
