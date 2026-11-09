/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_SECRET = 'test-cron-secret-1234567890abcdefghij'
type Row = Record<string, unknown>

const sendPushMock = vi.fn().mockResolvedValue({ sent: 1, pruned: 0 })
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: { DB: null, CRON_SECRET: TEST_SECRET } }) }))
vi.mock('@/lib/web-push', () => ({ sendPushToUser: sendPushMock }))

let state: {
  budgets: Row[]; money: Row[]; prefs: Row[]; notifs: Row[]; categories: Row[]; shares?: Row[]
}
const inserted: Row[] = []

function makeFakeDb() {
  const rowsFor = (t: string) =>
    t === 'budgets' ? state.budgets
    : t === 'money_entries' ? state.money
    : t === 'user_prefs' ? state.prefs
    : t === 'push_notifications' ? state.notifs
    : t === 'categories' ? state.categories
    : t === 'expense_shares' ? (state.shares ?? [])
    : t === 'fx_rates' ? [] : []
  const chain = (table: string) => {
    const wheres: Array<[string, string, unknown]> = []
    const c: any = {
      where: (col: string, op: string, val: unknown) => { wheres.push([col, op, val]); return c },
      select: () => c, selectAll: () => c,
      execute: async () => rowsFor(table).filter(r => wheres.every(([k, op, v]) =>
        op === 'is' && v === null ? r[k] == null : op === '=' ? r[k] === v : true)),
      executeTakeFirst: async () => {
        const list = rowsFor(table).filter(r => wheres.every(([k, op, v]) =>
          op === 'is' && v === null ? r[k] == null : op === '=' ? r[k] === v : true))
        if (table === 'push_notifications') {
          const id = wheres.find(([k]) => k === 'id')?.[2]
          return state.notifs.find(n => n.id === id) ?? null
        }
        return list[0] ?? null
      },
    }
    return c
  }
  return {
    selectFrom: chain,
    insertInto: () => ({ values: (v: Row) => ({ execute: async () => { inserted.push(v); state.notifs.push(v) } }) }),
  } as any
}
let fakeDb: any
vi.mock('@/lib/db', () => ({ createDb: () => fakeDb }))

const { POST } = await import('@/app/api/cron/budgets/route')
const req = (secret = TEST_SECRET) => new Request('http://x/api/cron/budgets', { method: 'POST', headers: { authorization: `Bearer ${secret}` } })

describe('/api/cron/budgets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inserted.length = 0
    state = {
      budgets: [{ id: 'cat-1', user_id: 'u1', category_id: 'cat-1', amount: 100000, currency: 'INR', deleted_at: null }],
      money: [{ id: 'm1', user_id: 'u1', category_id: 'cat-1', amount: 100000, currency: 'INR', direction: 'out', occurred_at: new Date().toISOString(), deleted_at: null }],
      prefs: [{ user_id: 'u1', primary_currency: 'INR', tz: 'Asia/Kolkata' }],
      notifs: [],
      categories: [{ id: 'cat-1', name: 'Food' }],
    }
    fakeDb = makeFakeDb()
  })

  it('rejects without auth', async () => {
    expect((await POST(new Request('http://x/api/cron/budgets', { method: 'POST' }))).status).toBe(403)
  })
  it('creates 80% and 100% alerts when a budget is fully spent', async () => {
    const res = await POST(req())
    const body = await res.json() as { alerts_created: number }
    expect(body.alerts_created).toBe(2)   // 80 + 100 both crossed at 100%
    expect(sendPushMock).toHaveBeenCalledTimes(1)
  })
  it('is idempotent (second run inserts nothing)', async () => {
    await POST(req())
    inserted.length = 0
    const res = await POST(req())
    const body = await res.json() as { alerts_created: number }
    expect(body.alerts_created).toBe(0)
  })
  it('a shared entry counts only your share: half the rent owed by someone else stays under 80%', async () => {
    // Budget 1000, rent 1000 of which 600 is owed by a flatmate → your share 400 = 40%.
    state.shares = [{ id: 's1', user_id: 'u1', money_entry_id: 'm1', person_id: 'p1', amount: 60000, settled_at: null, settled_account_id: null, deleted_at: null }]
    const res = await POST(req())
    const body = await res.json() as { alerts_created: number }
    expect(body.alerts_created).toBe(0)
    // Settling the share does not change spend: still no alert.
    state.shares = [{ ...state.shares[0], settled_at: new Date().toISOString(), settled_account_id: 'acc' }]
    expect(((await (await POST(req())).json()) as { alerts_created: number }).alerts_created).toBe(0)
  })
  it('no alert below 80%', async () => {
    state.money = [{ ...state.money[0], amount: 70000 }]
    const res = await POST(req())
    const body = await res.json() as { alerts_created: number }
    expect(body.alerts_created).toBe(0)
  })
  it('JPY-primary user gets whole-yen figures in notification (not 100x too small)', async () => {
    // Set up JPY-primary user with JPY budget of 500000 and spending of 500000 (100%)
    state.prefs = [{ user_id: 'u1', primary_currency: 'JPY', tz: 'Asia/Tokyo' }]
    state.budgets = [{ id: 'cat-1', user_id: 'u1', category_id: 'cat-1', amount: 500000, currency: 'JPY', deleted_at: null }]
    state.money = [{ id: 'm1', user_id: 'u1', category_id: 'cat-1', amount: 500000, currency: 'JPY', direction: 'out', occurred_at: new Date().toISOString(), deleted_at: null }]

    const res = await POST(req())
    const body = await res.json() as { alerts_created: number }
    expect(body.alerts_created).toBe(2)   // 80% and 100% thresholds crossed

    // Assert notification bodies contain whole-yen figures (500000, not 5000 which would be the incorrect 100x division)
    const monthKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit',
    }).format(new Date()).replace(/(\d{4})-(\d{2})/, '$1-$2')
    const notif100 = state.notifs.find(n => n.id === `budget-cat-1-${monthKey}-100`)
    expect(notif100?.body).toBe('500000 of 500000 this month')
  })
})
