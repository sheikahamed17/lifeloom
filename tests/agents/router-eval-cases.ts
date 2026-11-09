import type { RouterResponse } from '@/lib/agents/schemas/router-response'

type Intent = RouterResponse['intent']

export type EvalCase = {
  utterance: string
  /** The intent the router prompt is designed to produce. */
  expected: Intent
  /**
   * Other intents that also count as correct for genuinely-ambiguous utterances
   * (the query↔query and "note about X" defaults the Query final review adjudicated
   * as low-harm — both routes are read-only and dismissible).
   */
  acceptable?: Intent[]
  /** Why this case exists / which prompt rule governs it. */
  note?: string
}

/**
 * Live-router eval-set (Phase-4, deferred by the Query Agents final review).
 *
 * The unit suite (tests/agents/router.test.ts) mocks Groq, so it can only prove
 * plumbing — it can NOT prove the live gpt-oss-20b actually classifies the
 * ambiguous query/log collisions the way the prompt intends. This dataset pins
 * the *designed* routing (grounded in src/lib/agents/prompts/router.ts) so a
 * live run (`pnpm eval:router`) reports real classification accuracy and surfaces
 * regressions when the prompt is tuned. Hard collision cases carry a `note`.
 */
export const ROUTER_EVAL_CASES: EvalCase[] = [
  // ── log_money ────────────────────────────────────────────────
  { utterance: 'spent 80 on chai', expected: 'log_money' },
  { utterance: 'I just paid the rent', expected: 'log_money' },
  { utterance: 'bought a book for 350', expected: 'log_money' },
  { utterance: 'took uber to work, 220', expected: 'log_money' },

  // ── query_money ──────────────────────────────────────────────
  { utterance: 'how much did I spend on food', expected: 'query_money' },
  { utterance: 'what was my biggest expense last month', expected: 'query_money' },
  {
    utterance: 'learned I spent too much on food',
    expected: 'query_money',
    note: 'rule: money-query phrase alongside "learned" → query_money, not log_learning',
  },
  {
    utterance: 'make a note of what I spent last week',
    expected: 'query_money',
    note: 'rule: "make a note of what I spent…" (embedded question) → query_money, not log_note',
  },

  // ── log_task ─────────────────────────────────────────────────
  { utterance: 'remind me to call mom tomorrow at 3pm', expected: 'log_task' },
  { utterance: 'I need to file taxes by Friday', expected: 'log_task' },
  { utterance: 'add task: review the PR', expected: 'log_task' },
  {
    utterance: 'I need to learn Spanish',
    expected: 'log_task',
    note: 'rule: "I need to learn X" (future intention) → log_task, not log_learning',
  },
  {
    utterance: 'make a note to buy milk',
    expected: 'log_task',
    note: 'rule: "make a note to <action>" → log_task, not log_note',
  },
  {
    utterance: 'note: call the landlord',
    expected: 'log_task',
    note: 'rule: colon-prefix + action verb → log_task',
  },
  {
    utterance: 'note: find the password',
    expected: 'log_task',
    note: 'rule: colon-prefix + action verb "find" → log_task (NOT a query)',
  },
  {
    utterance: 'TIL I have a dentist appointment tomorrow',
    expected: 'log_task',
    note: 'rule: "TIL/I learned" attached to a scheduled item → log_task',
  },

  // ── query_task ───────────────────────────────────────────────
  { utterance: 'what do I have due this week', expected: 'query_task' },
  { utterance: 'anything overdue', expected: 'query_task' },
  { utterance: "what's on my list", expected: 'query_task' },

  // ── log_learning ─────────────────────────────────────────────
  { utterance: 'I learned that the borrow checker prevents data races', expected: 'log_learning' },
  { utterance: 'TIL TCP is stateful', expected: 'log_learning' },
  {
    utterance: 'note that I learned monads from a Haskell talk',
    expected: 'log_learning',
    note: 'rule: "note that I learned X" (note-framed learning) → log_learning, not log_note',
  },

  // ── query_learning ───────────────────────────────────────────
  { utterance: 'what did I learn about Rust', expected: 'query_learning' },
  { utterance: 'show my learnings', expected: 'query_learning' },
  {
    utterance: 'remind me what I learned about Rust',
    expected: 'query_learning',
    note: 'rule: "remind me <question>" → matching query intent, not log_task',
  },
  {
    utterance: "tell me what I've learned",
    expected: 'query_learning',
    note: 'recorded candidate — question about past learnings',
  },
  {
    utterance: 'what did I learn about my spending',
    expected: 'query_learning',
    acceptable: ['query_money'],
    note: 'ambiguous (final review): "what did I learn" → query_learning; query_money also acceptable (both read-only)',
  },

  // ── log_note ─────────────────────────────────────────────────
  { utterance: 'note that the wifi password is hunter2', expected: 'log_note' },
  { utterance: "jot down the client's new address", expected: 'log_note' },
  { utterance: 'make a note: the gate code is 4471', expected: 'log_note' },
  {
    utterance: 'note that I spent $50 on lunch',
    expected: 'log_money',
    note: 'rule: money amount + note-framing → log_money',
  },
  {
    utterance: 'note that I found a bug',
    expected: 'log_note',
    acceptable: ['log_learning'],
    note: 'rule: past-tense fact being recorded → log_note or log_learning (NOT a search)',
  },
  {
    utterance: 'note about my vacation',
    expected: 'log_note',
    acceptable: ['query_notes'],
    note: 'ambiguous (final review): bare "note about X" defaults to log_note; query_notes low-harm',
  },

  // ── query_notes ──────────────────────────────────────────────
  { utterance: 'find my note about the wifi password', expected: 'query_notes' },
  { utterance: 'search my notes for project X', expected: 'query_notes' },
  {
    utterance: 'find my note to call mom',
    expected: 'query_notes',
    note: 'rule: "find my note …" → query_notes even with an action-looking object',
  },

  // ── chat ─────────────────────────────────────────────────────
  { utterance: 'hi', expected: 'chat' },
  { utterance: 'thanks', expected: 'chat' },
  { utterance: 'what can you do', expected: 'chat' },
  { utterance: 'delete that last one', expected: 'chat' },

  // ── set_budget ────────────────────────────────────────────────
  { utterance: 'set a budget for food 8000', expected: 'set_budget' },
  { utterance: 'cap transport at 3000', expected: 'set_budget' },
  { utterance: 'budget 5000 for groceries', expected: 'set_budget' },
  {
    utterance: "what's my food budget",
    expected: 'query_money',
    acceptable: ['chat'],
    note: 'rule: "what\'s my X budget" (query, not setting) → query_money or chat, not set_budget',
  },

  // ── set_budget ↔ log_money ambiguous-verb edges (router-skeptic, Task 4) ──
  // Allocation/reservation verbs straddle log_money and set_budget. Harm is LOW
  // in either direction: set_budget produces a dismissible confirmation chip, so
  // nothing is written until the user taps Set. Live-model tuning, un-pinnable in
  // mocked unit tests — this is the intended home for these observations.
  {
    utterance: 'I allocated 8000 for food',
    expected: 'log_money',
    acceptable: ['set_budget'],
    note: 'ambiguous verb "allocate" — leans budget/reserve but could be spend; chip makes either dismissible',
  },
  {
    utterance: 'put 8000 aside for groceries',
    expected: 'log_money',
    acceptable: ['set_budget'],
    note: 'ambiguous "set aside" — reserve vs spend; low-harm either way',
  },
  {
    utterance: 'committed 8000 to food this month',
    expected: 'log_money',
    acceptable: ['set_budget'],
    note: 'ambiguous "committed" + "this month"; low-harm either way',
  },
  {
    utterance: 'set a budget for food',
    expected: 'chat',
    acceptable: ['query_money', 'set_budget'],
    note: 'regression guard: the old "set a budget for food"→chat example was replaced; no amount → vague',
  },

  // ── shared expenses: log_money with shared_with ─────────────
  { utterance: 'rent 20000 split with Arun', expected: 'log_money' },
  { utterance: 'dinner 2400 shared with Arun and Priya', expected: 'log_money' },
  { utterance: 'paid 900 for the cab, Priya owes a third', expected: 'log_money' },
  { utterance: 'groceries 3200 for me and Arun', expected: 'log_money' },
  { utterance: 'electricity bill 1800, split with my flatmate Ravi', expected: 'log_money' },
  { utterance: "movie tickets 600, Priya's share is 300", expected: 'log_money' },
  // ── settle_share: someone paid the user back ────────────────
  { utterance: 'Arun paid me 10000', expected: 'settle_share' },
  { utterance: 'got 10k back from Arun for rent', expected: 'settle_share' },
  { utterance: 'Priya transferred her share, 800', expected: 'settle_share' },
  { utterance: 'Ravi settled up 1200', expected: 'settle_share' },
  // ── negatives: paying someone is the user's own spend ───────
  { utterance: 'paid Arun 500 for lunch', expected: 'log_money', note: 'the user pays Arun → spend, not a repayment' },
  { utterance: 'gave Priya 2000 for the gift', expected: 'log_money', note: 'user gives money → spend, not settle_share' },
]
