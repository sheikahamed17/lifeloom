/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_SESSION = { user: { id: 'user1', email: 'test@example.com' } }

type Row = Record<string, unknown>

let subs: Row[] = []
const insertedNotifs: Row[] = []

const fakeDb = {
  selectFrom: () => {
    const chain: any = {
      where: () => chain,
      select: () => chain,
      selectAll: () => chain,
      execute: async () => subs,
    }
    return chain
  },
  insertInto: (table: string) => ({
    values: (v: Row) => ({
      execute: async () => {
        if (table === 'push_notifications') insertedNotifs.push(v)
      },
    }),
  }),
}

const sendPushMock = vi.fn().mockResolvedValue({ sent: 1, pruned: 0 })

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { DB: null, VAPID_PRIVATE_KEY: 'k', VAPID_PUBLIC_KEY: 'p' } }),
}))
vi.mock('@/lib/auth', () => ({ getSession: vi.fn() }))
vi.mock('@/lib/db', () => ({ createDb: () => fakeDb }))
vi.mock('@/lib/web-push', () => ({ sendPushToUser: sendPushMock }))

const { POST } = await import('@/app/api/push/test/route')

function req() {
  return new Request('http://x/api/push/test', { method: 'POST' })
}

describe('/api/push/test', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    subs = []
    insertedNotifs.length = 0
    const { getSession } = await import('@/lib/auth')
    vi.mocked(getSession).mockResolvedValue(TEST_SESSION as any)
    sendPushMock.mockResolvedValue({ sent: 1, pruned: 0 })
  })

  it('rejects without session', async () => {
    const { getSession } = await import('@/lib/auth')
    vi.mocked(getSession).mockResolvedValueOnce(null)
    const res = await POST(req())
    expect(res.status).toBe(401)
  })

  it('returns 409 with a hint when the user has no subscriptions (no push, no seeded notification)', async () => {
    subs = []
    const res = await POST(req())
    expect(res.status).toBe(409)
    const data = (await res.json()) as { ok: boolean; subscriptions: number; hint: string }
    expect(data.ok).toBe(false)
    expect(data.subscriptions).toBe(0)
    expect(data.hint).toMatch(/enable notifications/i)
    expect(sendPushMock).not.toHaveBeenCalled()
    expect(insertedNotifs).toHaveLength(0)
  })

  it('seeds one test notification for the caller and wakes their subscriptions', async () => {
    subs = [{ id: 's1' }, { id: 's2' }]
    const res = await POST(req())
    expect(res.status).toBe(200)
    const data = (await res.json()) as { ok: boolean; subscriptions: number; sent: number; pruned: number }
    expect(data.ok).toBe(true)
    expect(data.subscriptions).toBe(2)
    expect(data.sent).toBe(1)

    expect(insertedNotifs).toHaveLength(1)
    expect(insertedNotifs[0].user_id).toBe('user1')
    expect(String(insertedNotifs[0].id)).toMatch(/^test-/)
    expect(insertedNotifs[0].title).toBe('Lifeloom test 🔔')

    expect(sendPushMock).toHaveBeenCalledTimes(1)
    expect(sendPushMock).toHaveBeenCalledWith(fakeDb, { VAPID_PRIVATE_KEY: 'k', VAPID_PUBLIC_KEY: 'p' }, 'user1')
  })

  it('reports ok:false when no subscription was successfully woken', async () => {
    subs = [{ id: 's1' }]
    sendPushMock.mockResolvedValueOnce({ sent: 0, pruned: 1 })
    const res = await POST(req())
    expect(res.status).toBe(200)
    const data = (await res.json()) as { ok: boolean; sent: number; pruned: number }
    expect(data.ok).toBe(false)
    expect(data.sent).toBe(0)
    expect(data.pruned).toBe(1)
  })
})
