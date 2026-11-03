import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEST_PREFS = { primary_currency: 'INR', tz: 'Asia/Kolkata' }

const DEFAULT_CATEGORIES: Record<string, unknown>[] = [{ id: 'cat1', name: 'Dining', kind: 'spend', user_id: 'user123', is_archived: 0, deleted_at: null, created_at: '2026-01-01T00:00:00.000Z' }]
let categoryRows = DEFAULT_CATEGORIES

// FIX 2: Chainable fake DB that supports multiple .where() calls
const fakeDb = {
  selectFrom: (table: string) => {
    const wheres: Array<{ col: string; op: string; val: unknown }> = []

    const applyWheres = (
      data: Record<string, unknown>[],
    ) => {
      return data.filter((row: Record<string, unknown>) => {
        for (const w of wheres) {
          if (table === 'user_prefs' && w.col === 'user_id' && row.user_id !== w.val) return false
          if (table === 'categories') {
            if (w.col === 'user_id' && row.user_id !== w.val) return false
            if (w.col === 'is_archived' && row.is_archived !== w.val) return false
            if (w.col === 'deleted_at' && w.op === 'is' && row.deleted_at !== null) return false
          }
        }
        return true
      })
    }

    function makeBuilder(currentWheres: Array<{ col: string; op: string; val: unknown }>) {
      return {
        where: (col: string, op: string, val: unknown) => {
          const newWheres = [...currentWheres, { col, op, val }]
          return makeBuilder(newWheres)
        },
        selectAll: () => ({
          executeTakeFirst: async () => {
            const data = table === 'user_prefs' ? [TEST_PREFS] : []
            const filtered = applyWheres(data as Record<string, unknown>[])
            return filtered[0] ?? undefined
          },
          execute: async () => {
            const data = table === 'categories' ? categoryRows : []
            return applyWheres(data as Record<string, unknown>[])
          },
        }),
        select: (cols: string[]) => ({
          execute: async () => {
            const data = table === 'categories' ? categoryRows : []
            const filtered = applyWheres(data as Record<string, unknown>[])
            return filtered.map((row: Record<string, unknown>) => {
              const result: Record<string, unknown> = {}
              cols.forEach(col => {
                result[col] = row[col]
              })
              return result
            })
          },
        }),
      }
    }

    return makeBuilder(wheres)
  },
}

// FIX 3: Proper vi.mock setup for getSession
vi.mock('@/lib/auth', () => ({
  getSession: vi.fn().mockResolvedValue({ user: { id: 'user123' } }),
}))

// FIX 3: Proper vi.mock setup for parseReceiptImage
vi.mock('@/lib/agents/receipt-agent', () => ({
  parseReceiptImage: vi.fn().mockResolvedValue({
    amount: 5000,
    currency: 'INR',
    direction: 'out',
    category_name: 'Dining',
    description: 'Coffee',
    occurred_at: '2026-07-02T10:00:00.000Z',
  }),
}))

const fakeR2 = {
  put: vi.fn().mockResolvedValue({}),
}

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({
    env: {
      DB: null,
      RECEIPTS: fakeR2,
      GROQ_API_KEY: 'test-key',
    },
  }),
}))
vi.mock('@/lib/db', () => ({ createDb: () => fakeDb }))

const { POST } = await import('@/app/api/receipt/route')

describe('/api/receipt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakeR2.put.mockResolvedValue({})
  })

  it('rejects without session', async () => {
    const { getSession } = await import('@/lib/auth')
    vi.mocked(getSession).mockResolvedValueOnce(null as never)

    const blob = new Blob(['data'], { type: 'image/jpeg' })
    const fd = new FormData()
    fd.append('image', blob)
    const res = await POST(new Request('http://x/api/receipt', { method: 'POST', body: fd }))
    expect(res.status).toBe(401)
  })

  it('rejects without image blob', async () => {
    const res = await POST(new Request('http://x/api/receipt', {
      method: 'POST',
      body: new FormData(),
    }))
    expect(res.status).toBe(400)
  })

  it('rejects oversized images (>3MB)', async () => {
    const bigBlob = new Blob([new ArrayBuffer(3_145_729)], { type: 'image/jpeg' })
    const fd = new FormData()
    fd.append('image', bigBlob)
    const res = await POST(new Request('http://x/api/receipt', { method: 'POST', body: fd }))
    expect(res.status).toBe(413)
  })

  it('rejects unsupported content types', async () => {
    const blob = new Blob(['data'], { type: 'video/mp4' })
    const fd = new FormData()
    fd.append('image', blob)
    const res = await POST(new Request('http://x/api/receipt', { method: 'POST', body: fd }))
    expect(res.status).toBe(415)
  })

  it('streams uploading → parsing → payload on success', async () => {
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' })
    const fd = new FormData()
    fd.append('image', blob)

    const res = await POST(new Request('http://x/api/receipt', { method: 'POST', body: fd }))
    expect(res.status).toBe(200)

    const text = await res.text()
    expect(text).toContain('uploading')
    expect(text).toContain('parsing')
    expect(text).toContain('payload')
    expect(text).toContain('cat1') // The matched category ID

    // Check mocks after consuming response
    expect(fakeR2.put).toHaveBeenCalled()
  })

  it('picks the same category every time when the server holds same-name duplicates', async () => {
    const { parseReceiptImage } = await import('@/lib/agents/receipt-agent')
    // D1 returns rows in no set order; the canonical id (what the client dedupe keeps) must win
    const row = (id: string, created_at: string) => ({ id, name: 'Dining', kind: 'spend', user_id: 'user123', is_archived: 0, deleted_at: null, created_at })
    categoryRows = [row('uuid-dup', '2026-01-01T00:00:00.000Z'), row('cat-user123-dining', '2026-06-01T00:00:00.000Z')]
    try {
      const fd = new FormData()
      fd.append('image', new Blob(['jpeg'], { type: 'image/jpeg' }))
      const text = await (await POST(new Request('http://x/api/receipt', { method: 'POST', body: fd }))).text()
      expect(text).toContain('"category_id":"cat-user123-dining"')
      // …and the AI is offered each name once
      expect(vi.mocked(parseReceiptImage)).toHaveBeenLastCalledWith(expect.objectContaining({ categories: [{ name: 'Dining', kind: 'spend' }] }))
    } finally {
      categoryRows = DEFAULT_CATEGORIES
    }
  })

  it('includes receipt_key in error event when vision fails', async () => {
    const { parseReceiptImage } = await import('@/lib/agents/receipt-agent')
    vi.mocked(parseReceiptImage).mockRejectedValueOnce(new Error('vision failed'))

    const blob = new Blob(['x'], { type: 'image/jpeg' })
    const fd = new FormData()
    fd.append('image', blob)

    const res = await POST(new Request('http://x/api/receipt', { method: 'POST', body: fd }))
    expect(res.status).toBe(200)

    const text = await res.text()
    expect(text).toContain('error')
    expect(text).toContain('vision failed')
    expect(text).toContain('receipt_key')
  })

  it('stores the image in R2 before parsing', async () => {
    const blob = new Blob(['data'], { type: 'image/jpeg' })
    const fd = new FormData()
    fd.append('image', blob)

    const res = await POST(new Request('http://x/api/receipt', { method: 'POST', body: fd }))
    // Consume the stream to trigger the start function
    await res.text()

    expect(fakeR2.put).toHaveBeenCalledWith(
      expect.stringContaining('user123/'),
      expect.any(Object),
      expect.objectContaining({ httpMetadata: expect.any(Object) }),
    )
  })

  it('adds receipt_key to the payload', async () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    const fd = new FormData()
    fd.append('image', blob)

    const res = await POST(new Request('http://x/api/receipt', { method: 'POST', body: fd }))
    const text = await res.text()
    expect(text).toContain('receipt_key')
    expect(text).toContain('user123')
  })
})
