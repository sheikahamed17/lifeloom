import type { Kysely } from 'kysely'
import type { DB } from '@/lib/db'
import type { Op } from '@/types/ops'
import { materializeRow } from '@/lib/materialize'
import { DEMO_USER } from '@/lib/demo'

// Seeds the SHARED demo account with realistic-but-fictional data across every
// domain. Because Lifeloom is local-first (the client reads Dexie, populated by
// syncing the op-log), the seed writes OP-LOG entries — NOT just projection
// tables — then materializes each so the server-side projections are populated
// too. Deterministic entity ids make the reset idempotent; HLCs are unique and
// monotonic. All amounts are minor units (₹240 → 24000).
//
// Every caller (the initial `scripts/seed-demo.ts` and the reset cron) must
// verify DEMO_MODE before invoking this — see demo-reset route + the script.

const DEVICE = 'demo-seed'
let hlcCounter = 0

function hlcFor(iso: string): string {
  const ms = new Date(iso).getTime().toString().padStart(16, '0')
  return `${ms}-${(hlcCounter++).toString().padStart(6, '0')}-demo`
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}
function daysAhead(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString()
}
function dayStr(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
}

type Seed = { kind: Op['entity_kind']; id: string; at: string; payload: Record<string, unknown> }

export function buildSeeds(): Seed[] {
  const seeds: Seed[] = []
  const add = (kind: Op['entity_kind'], id: string, at: string, payload: Record<string, unknown>) =>
    seeds.push({ kind, id, at, payload })

  // --- Categories ---
  const cats = [
    { id: 'demo-cat-groceries', name: 'Groceries', kind: 'spend', icon: '🛒' },
    { id: 'demo-cat-dining', name: 'Dining', kind: 'spend', icon: '🍽️' },
    { id: 'demo-cat-transport', name: 'Transport', kind: 'spend', icon: '🚌' },
    { id: 'demo-cat-utilities', name: 'Utilities', kind: 'spend', icon: '💡' },
    { id: 'demo-cat-shopping', name: 'Shopping', kind: 'spend', icon: '🛍️' },
    { id: 'demo-cat-salary', name: 'Salary', kind: 'income', icon: '💼' },
  ]
  cats.forEach((c, i) => add('category', c.id, daysAgo(30), { name: c.name, kind: c.kind, icon: c.icon, sort_order: i }))

  // --- Accounts (minor units) ---
  // The last-4 in a name is auto-matched against bank/card alerts; the bank's
  // debit-card number (different from the account number) rides as a hint.
  // Everyday Bank is the ★ default for manual/voice/receipt entries.
  add('account', 'demo-acct-bank', daysAgo(30), { name: 'Everyday Bank 4821', type: 'asset', opening_balance: 4200000, currency: 'INR', icon: '🏦', match_hints: '6604', is_default: 1 })
  add('account', 'demo-acct-card', daysAgo(30), { name: 'Rewards Card 7392', type: 'liability', opening_balance: -850000, currency: 'INR', icon: '💳' })
  add('account', 'demo-acct-savings', daysAgo(30), { name: 'Savings', type: 'asset', opening_balance: 12000000, currency: 'INR', icon: '🐷' })

  // --- Money (minor units, mixed categories/accounts/dates) ---
  const money = [
    ['Salary — Contoso Ltd', 8500000, 'in', 'demo-cat-salary', 'demo-acct-bank', 26],
    ['Demo Mart', 185000, 'out', 'demo-cat-groceries', 'demo-acct-bank', 24],
    ['Sample Cafe', 24000, 'out', 'demo-cat-dining', 'demo-acct-card', 22],
    ['MetroTransit pass', 60000, 'out', 'demo-cat-transport', 'demo-acct-bank', 21],
    ['Volt Energy', 140000, 'out', 'demo-cat-utilities', 'demo-acct-bank', 20],
    ['Cloudline Store', 320000, 'out', 'demo-cat-shopping', 'demo-acct-card', 18],
    ['Fresh Basket', 96500, 'out', 'demo-cat-groceries', 'demo-acct-bank', 16],
    ['Corner Diner', 41000, 'out', 'demo-cat-dining', 'demo-acct-card', 15],
    ['Ride to airport', 52000, 'out', 'demo-cat-transport', 'demo-acct-card', 13],
    ['Demo Mart', 210000, 'out', 'demo-cat-groceries', 'demo-acct-bank', 11],
    ['Streamly subscription', 49900, 'out', 'demo-cat-shopping', 'demo-acct-card', 10],
    ['Bean & Brew', 18000, 'out', 'demo-cat-dining', 'demo-acct-card', 9],
    ['City Water', 62000, 'out', 'demo-cat-utilities', 'demo-acct-bank', 8],
    ['Fresh Basket', 118000, 'out', 'demo-cat-groceries', 'demo-acct-bank', 6],
    ['Bus top-up', 30000, 'out', 'demo-cat-transport', 'demo-acct-bank', 5],
    ['Gadget World', 275000, 'out', 'demo-cat-shopping', 'demo-acct-card', 4],
    ['Sample Cafe', 26000, 'out', 'demo-cat-dining', 'demo-acct-card', 3],
    ['Demo Mart', 142000, 'out', 'demo-cat-groceries', 'demo-acct-bank', 2],
    ['Corner Diner', 38000, 'out', 'demo-cat-dining', 'demo-acct-card', 1],
    ['Metro fare', 4000, 'out', 'demo-cat-transport', 'demo-acct-bank', 0],
  ] as const
  money.forEach(([desc, amount, direction, category_id, account_id, ago], i) => {
    const at = daysAgo(ago)
    add('money', `demo-money-${i}`, at, { amount, currency: 'INR', direction, category_id, account_id, description: desc, occurred_at: at, source: 'manual', tags: [] })
  })

  // --- Auto-imported bank/card alerts (what email/SMS ingest produces) ---
  // account_id is what the real matcher picks from the alert text (asserted in
  // tests/demo-seed.test.ts). Two are left untagged on purpose: an unknown card
  // (•1188 → the "which account?" pill) and an older Rewards Card alert that
  // still has no account (→ Settings › Accounts › Past alerts "Tag 1").
  const alerts = [
    ['Rs.1,240.00 spent on your Rewards Card ending 7392 at SAMPLE CAFE', 124000, 'demo-cat-dining', 'demo-acct-card', 'email', 'SAMPLE CAFE', 7],
    ['Sent Rs.600.00 from Everyday Bank A/c XX4821 to METROTRANSIT. UPI Ref 401234567890', 60000, 'demo-cat-transport', 'demo-acct-bank', 'sms', 'METROTRANSIT', 5],
    ['Thank you for using your Everyday Bank Debit Card ending 6604 for Rs.450.00 at FRESH BASKET', 45000, 'demo-cat-groceries', 'demo-acct-bank', 'email', 'FRESH BASKET', 3],
    ['Rs.899.00 spent on Credit Card ending 1188 at BOOKNOOK', 89900, null, null, 'email', 'BOOKNOOK', 1],
    ['Rs.320.00 spent on your Rewards Card ending 7392 at BEAN & BREW', 32000, 'demo-cat-dining', null, 'email', 'BEAN & BREW', 27],
  ] as const
  alerts.forEach(([raw_input, amount, category_id, account_id, source, merchant, ago], i) => {
    const at = daysAgo(ago)
    add('money', `demo-alert-${i}`, at, { amount, currency: 'INR', direction: 'out', category_id, account_id, description: merchant, merchant, occurred_at: at, source, raw_input, tags: [] })
  })

  // --- Budgets (near / over / under) ---
  add('budget', 'demo-budget-groceries', daysAgo(30), { category_id: 'demo-cat-groceries', amount: 1000000, currency: 'INR' }) // ~60%
  add('budget', 'demo-budget-dining', daysAgo(30), { category_id: 'demo-cat-dining', amount: 150000, currency: 'INR' })       // near
  add('budget', 'demo-budget-shopping', daysAgo(30), { category_id: 'demo-cat-shopping', amount: 800000, currency: 'INR' })   // over

  // --- Savings goal (manual progress) ---
  add('goal', 'demo-goal-coast', daysAgo(30), { name: 'Trip to the coast', target_amount: 5000000, saved_amount: 3200000, currency: 'INR', icon: '🏖️', account_id: null, target_date: daysAhead(90) })

  // --- Recurring: an upcoming bill + a monthly savings sweep transfer ---
  add('recurring', 'demo-recur-bill', daysAgo(30), {
    amount: 140000, currency: 'INR', direction: 'out', category_id: 'demo-cat-utilities', description: 'Volt Energy bill',
    period: 'monthly', interval_count: 1, anchor_at: daysAgo(30), next_due_at: daysAhead(5),
    end_condition_kind: 'never', is_active: 1, occurrences_so_far: 1,
  })
  add('recurring', 'demo-recur-sweep', daysAgo(30), {
    amount: 1000000, currency: 'INR', direction: 'out', description: 'Savings sweep',
    period: 'monthly', interval_count: 1, anchor_at: daysAgo(30), next_due_at: daysAhead(9),
    end_condition_kind: 'never', is_active: 1, occurrences_so_far: 1,
    from_account_id: 'demo-acct-bank', to_account_id: 'demo-acct-savings',
  })

  // --- Projects + tasks (some done, some due soon, one with sub-tasks) ---
  add('project', 'demo-proj-home', daysAgo(20), { name: 'Home', color: '#6f7bff' })
  add('project', 'demo-proj-personal', daysAgo(20), { name: 'Personal', color: '#34e6ff' })
  const tasks: Array<[string, string | null, string | null, string | null, number]> = [
    // title, due_at, completed_at, project_id, ago
    ['Pay the card bill', daysAhead(3), null, 'demo-proj-home', 6],
    ['Renew gym membership', daysAhead(6), null, 'demo-proj-personal', 5],
    ['Book dentist appointment', null, null, 'demo-proj-personal', 4],
    ['Water the plants', null, daysAgo(1), 'demo-proj-home', 3],
    ['Reply to landlord', daysAgo(1), null, 'demo-proj-home', 2], // overdue
    ['Back up photos', null, daysAgo(2), 'demo-proj-personal', 8],
  ]
  tasks.forEach(([title, due_at, completed_at, project_id, ago], i) => {
    add('task', `demo-task-${i}`, daysAgo(ago), { title, due_at, completed_at, priority: 'medium', project_id, source: 'manual', tags: [] })
  })
  // Parent + sub-tasks
  add('task', 'demo-task-trip', daysAgo(7), { title: 'Plan weekend trip', due_at: daysAhead(10), completed_at: null, priority: 'medium', project_id: 'demo-proj-personal', source: 'manual', tags: [] })
  add('task', 'demo-task-trip-1', daysAgo(7), { title: 'Book a place to stay', due_at: null, completed_at: daysAgo(1), priority: 'medium', parent_id: 'demo-task-trip', source: 'manual', tags: [] })
  add('task', 'demo-task-trip-2', daysAgo(7), { title: 'Map the route', due_at: null, completed_at: null, priority: 'medium', parent_id: 'demo-task-trip', source: 'manual', tags: [] })
  add('task', 'demo-task-trip-3', daysAgo(7), { title: 'Pack a bag', due_at: null, completed_at: null, priority: 'medium', parent_id: 'demo-task-trip', source: 'manual', tags: [] })

  // --- Learning ---
  const learning: Array<[string, string, number]> = [
    ['Kysely lets you build type-safe SQL without an ORM.', 'databases', 20],
    ['SQLite WAL mode improves concurrent read performance.', 'databases', 16],
    ['A hybrid logical clock (HLC) orders events across devices deterministically.', 'distributed-systems', 12],
    ['Cloudflare D1 caps bound parameters at 100 per query.', 'cloudflare', 9],
    ['React 19 auto-memoizes many renders, but hot loops still benefit from useMemo.', 'react', 5],
    ['PWAs cache their assets after first load, so First Load JS is a one-time cost.', 'web', 2],
  ]
  learning.forEach(([text, tag, ago], i) => {
    const at = daysAgo(ago)
    add('learning', `demo-learning-${i}`, at, { text, tags: [tag], attribution: null, source: 'manual', occurred_at: at })
  })

  // --- Notes (pre-written titles + tags) ---
  const notes: Array<[string, string, string[], number]> = [
    ['Deploy my own Lifeloom', 'idea: spin up my own instance from the template and self-host it', ['ideas'], 14],
    ['Weekend groceries', 'oats, coffee, fruit, pasta, olive oil', ['shopping'], 10],
    ['Book recommendations', 'a friend suggested two books on systems design', ['reading'], 7],
    ['Trip checklist', 'charger, headphones, sunscreen, charger cable', ['travel'], 4],
    ['Standup notes', 'ship the demo, tidy the changelog, review the seed data', ['work'], 1],
  ]
  notes.forEach(([title, body, tags, ago], i) => {
    const at = daysAgo(ago)
    add('note', `demo-note-${i}`, at, { title, body, tags, occurred_at: at, source: 'manual' })
  })

  // --- Habits + logs (active streaks of different lengths) ---
  const habits: Array<[string, string, number]> = [
    ['Morning walk', '🚶', 12],
    ['Read 20 min', '📖', 4],
    ['Drink water', '💧', 27],
  ]
  habits.forEach(([name, icon, streak], hi) => {
    const habitId = `demo-habit-${hi}`
    add('habit', habitId, daysAgo(40), { name, icon, schedule: null })
    for (let d = 0; d < streak; d++) {
      const day = dayStr(d)
      add('habit_log', `hlog-${habitId}-${day}`, daysAgo(d), { habit_id: habitId, day })
    }
  })

  // --- Journal (varied moods) ---
  const journal: Array<[string, string, number]> = [
    ['Shipped a big feature today and it felt great to see it live.', 'great', 9],
    ['Quiet, productive day. Cleared most of the backlog.', 'good', 6],
    ['A bit tired — took it slow and went for a long walk.', 'ok', 3],
    ['Reflected on the week; happy with the progress so far.', 'good', 1],
  ]
  journal.forEach(([body, mood, ago], i) => {
    const at = daysAgo(ago)
    add('journal', `demo-journal-${i}`, at, { body, mood, occurred_at: at, source: 'manual' })
  })

  // --- Insights (pre-written weekly digests — NOT generated live) ---
  const digests: Array<[number, number, string]> = [
    [7, 14, 'A steady week: spending was led by groceries and shopping, and you stayed under budget on dining. Two tasks slipped past their due date.'],
    [0, 7, 'Spending eased off vs last week, and your savings goal crossed 60%. Nice streak on your morning walk — keep it going!'],
  ]
  digests.forEach(([endAgo, startAgo, summary], i) => {
    const starts = daysAgo(startAgo)
    const ends = daysAgo(endAgo)
    add('insight', `demo-insight-${i}`, ends, {
      period: 'weekly', starts_at: starts, ends_at: ends, summary,
      metrics: JSON.stringify({ spend: 132500 + i * 20000, income: i === 1 ? 0 : 8500000, net: -132500, top_category: 'Groceries' }),
    })
  })

  return seeds
}

/** Wipe every demo data table, then reseed. Caller MUST have verified DEMO_MODE. */
export async function resetAndSeedDemo(db: Kysely<DB>): Promise<{ ops: number }> {
  await wipeDemoData(db)
  return seedDemo(db)
}

const DATA_TABLES = [
  'op_log', 'money_entries', 'recurring_rules', 'categories', 'tasks', 'learning_entries',
  'note_entries', 'insights', 'accounts', 'goals', 'transfers', 'budgets', 'projects',
  'habits', 'habit_logs', 'journal_entries', 'widgets', 'devices',
] as const

/** Delete every data row for the demo user (keeps the `user` row). */
export async function wipeDemoData(db: Kysely<DB>): Promise<void> {
  for (const t of DATA_TABLES) {
    await db.deleteFrom(t).where('user_id', '=', DEMO_USER.id).execute()
  }
}

/** Ensure the demo user exists, then insert every seed op + materialize it. */
export async function seedDemo(db: Kysely<DB>): Promise<{ ops: number }> {
  const now = Date.now()
  await db
    .insertInto('user')
    .values({ id: DEMO_USER.id, email: DEMO_USER.email, name: DEMO_USER.name, email_verified: 1, created_at: now, updated_at: now })
    .onConflict(oc => oc.column('id').doNothing())
    .execute()

  hlcCounter = 0
  const seeds = buildSeeds()
  for (const s of seeds) {
    const op: Op = {
      id: `op-${s.id}`,
      hlc: hlcFor(s.at),
      device_id: DEVICE,
      user_id: DEMO_USER.id,
      entity_kind: s.kind,
      entity_id: s.id,
      op_type: 'create',
      payload: s.payload,
      schema_version: 1,
    }
    await db
      .insertInto('op_log')
      .values({
        id: op.id, user_id: op.user_id, hlc: op.hlc, device_id: op.device_id,
        entity_kind: op.entity_kind, entity_id: op.entity_id, op_type: op.op_type,
        payload: JSON.stringify(op.payload), schema_version: op.schema_version, applied_at: now,
      })
      .onConflict(oc => oc.column('id').doNothing())
      .execute()
    await materializeRow(db, op, DEMO_USER.id)
  }
  return { ops: seeds.length }
}
