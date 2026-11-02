/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hashSecret, makeIngestToken } from '@/lib/ingest-token'

type Row = Record<string, unknown>
let prefsRow: Row | null = null
const opLog: Row[] = []
const pushRows: Row[] = []
let accountsRows: Row[] = []

function makeFakeDb() {
  return {
    selectFrom: (table: string) => {
      let idVal: unknown
      const conditions: Array<{ col: string; op: string; val: unknown }> = []
      const b: any = {
        where: (c: string, o: string, v: unknown) => {
          if (c === 'id') idVal = v
          conditions.push({ col: c, op: o, val: v })
          return b
        },
        select: () => b,
        selectAll: () => b,
        executeTakeFirst: async () => {
          if (table === 'op_log') return opLog.find(o => o.id === idVal) ?? null
          if (table === 'user_prefs') return prefsRow
          return null
        },
        execute: async () => {
          if (table === 'accounts') {
            let result = [...accountsRows]
            for (const cond of conditions) {
              if (cond.col === 'user_id' && cond.op === '=') {
                result = result.filter(r => r.user_id === cond.val)
              }
              if (cond.col === 'deleted_at' && cond.op === 'is') {
                if (cond.val === null) {
                  result = result.filter(r => !r.deleted_at)
                }
              }
            }
            return result
          }
          return []
        },
      }
      return b
    },
    insertInto: (table: string) => ({
      values: (v: Row) => {
        const r: any = { execute: async () => { (table === 'push_notifications' ? pushRows : opLog).push(v) }, onConflict: () => r }
        return r
      },
    }),
  } as any
}

let currentFakeDb: any
const parseSmsMock = vi.fn()

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: { DB: null, GROQ_API_KEY: 'k' } }) }))
vi.mock('@/lib/db', () => ({ createDb: () => currentFakeDb }))
vi.mock('@/lib/agents/llm-client', () => ({ makeGroqClient: () => ({}) }))
vi.mock('@/lib/agents/sms-agent', () => ({ parseSms: (...a: unknown[]) => parseSmsMock(...a) }))
const materializeMock = vi.fn(async (..._a: unknown[]) => {})
vi.mock('@/lib/materialize', () => ({ materializeRow: (...a: unknown[]) => materializeMock(...a) }))

const sendPushMock = vi.fn(async (..._a: unknown[]) => ({ sent: 1, pruned: 0 }))
vi.mock('@/lib/web-push', () => ({ sendPushToUser: (...a: unknown[]) => sendPushMock(...a) }))

const { POST } = await import('@/app/api/ingest/sms/route')

const U = 'user-1'
let goodToken = ''

function req(token: string, text: string) {
  return new Request('http://x/api/ingest/sms', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}

function reqS(token: string, text: string, source?: string) {
  return new Request('http://x/api/ingest/sms', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(source === undefined ? { text } : { text, source }),
  })
}

function storedPayload() {
  return JSON.parse(String(opLog[0].payload)) as { source: string; raw_input: string }
}

describe('POST /api/ingest/sms', () => {
  beforeEach(async () => {
    opLog.length = 0
    pushRows.length = 0
    accountsRows.length = 0
    parseSmsMock.mockReset()
    sendPushMock.mockClear()
    currentFakeDb = makeFakeDb()
    const { token, secret } = makeIngestToken(U)
    goodToken = token
    prefsRow = { user_id: U, primary_currency: 'INR', tz: 'Asia/Kolkata', sms_ingest_token_hash: await hashSecret(secret) }
  })

  it('rejects a bad token (403, no op)', async () => {
    const res = await POST(req('pulse_sms_user-1_wrongsecret', 'Rs.500 debited AMAZON'))
    expect(res.status).toBe(403)
    expect(opLog).toHaveLength(0)
  })

  it('creates one money op for a transaction', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 50000, currency: 'INR', direction: 'out', merchant: 'AMAZON' })
    const res = await POST(req(goodToken, 'Rs.500 debited AMAZON'))
    const body = await res.json() as { ok: boolean; added: boolean }
    expect(res.status).toBe(200)
    expect(body.added).toBe(true)
    expect(opLog).toHaveLength(1)
    expect(opLog[0].entity_kind).toBe('money')
    expect(String(opLog[0].entity_id).startsWith('sms-')).toBe(true)
  })

  it('skips a non-transaction (added:false, no op)', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: false })
    const res = await POST(req(goodToken, 'Your OTP is 1234'))
    const body = await res.json() as { added: boolean }
    expect(body.added).toBe(false)
    expect(opLog).toHaveLength(0)
  })

  it('is idempotent: re-POSTing the same SMS makes no duplicate', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 50000, currency: 'INR', direction: 'out', merchant: 'AMAZON' })
    const first = await (await POST(req(goodToken, 'Rs.500 debited AMAZON'))).json() as { added: boolean }
    expect(first.added).toBe(true)
    const second = await (await POST(req(goodToken, 'Rs.500 debited AMAZON'))).json() as { added: boolean }
    expect(second.added).toBe(false)
    expect(opLog).toHaveLength(1)
  })

  it("stores source 'email' when the body says so", async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 50000, currency: 'INR', direction: 'out', merchant: 'AMAZON' })
    const res = await POST(reqS(goodToken, 'debited Rs.500 AMAZON via email', 'email'))
    expect((await res.json() as { added: boolean }).added).toBe(true)
    expect(storedPayload().source).toBe('email')
  })

  it("falls back to 'sms' for an unknown source (whitelist)", async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 50000, currency: 'INR', direction: 'out', merchant: 'AMAZON' })
    await POST(reqS(goodToken, 'debited Rs.500 AMAZON evil', 'evil'))
    expect(storedPayload().source).toBe('sms')
  })

  it("defaults to 'sms' when source is omitted", async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 50000, currency: 'INR', direction: 'out', merchant: 'AMAZON' })
    await POST(reqS(goodToken, 'debited Rs.500 AMAZON plain'))
    expect(storedPayload().source).toBe('sms')
  })

  it('clips the body to 4000 chars before store', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 50000, currency: 'INR', direction: 'out', merchant: 'AMAZON' })
    const long = 'debited Rs.500 AMAZON ' + 'x'.repeat(5000)
    await POST(reqS(goodToken, long, 'email'))
    expect(storedPayload().raw_input.length).toBe(4000)
  })

  it('returns 503 (retryable), NOT 500, when the parser throws (Groq rate-limit)', async () => {
    parseSmsMock.mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }))
    const res = await POST(reqS(goodToken, 'Rs.500 debited AMAZON'))
    expect(res.status).toBe(503)
    expect(opLog).toHaveLength(0)
  })

  it('dryRun returns the parsed agent output + payload and writes NO op', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 47500, currency: 'INR', direction: 'out', merchant: 'CRUNCHYROLL' })
    const dryReq = new Request('http://x/api/ingest/sms', {
      method: 'POST',
      headers: { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Rs.475 spent CRUNCHYROLL', source: 'email', dryRun: true }),
    })
    const res = await POST(dryReq)
    const body = await res.json() as { ok: boolean; dryRun: boolean; agentOut: { amount: number }; payload: { source: string } }
    expect(res.status).toBe(200)
    expect(body.dryRun).toBe(true)
    expect(body.agentOut.amount).toBe(47500)
    expect(body.payload.source).toBe('email')
    expect(opLog).toHaveLength(0)
  })

  it('sends ONE categorize push on a new ingest (added:true)', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 47500, currency: 'INR', direction: 'out', merchant: 'CRUNCHYROLL' })
    const res = await POST(reqS(goodToken, 'Rs.475 spent CRUNCHYROLL', 'email'))
    expect((await res.json() as { added: boolean }).added).toBe(true)
    expect(pushRows).toHaveLength(1)
    expect(String(pushRows[0].url)).toContain('/app?categorize=')
    expect(String(pushRows[0].title)).toContain('CRUNCHYROLL')
    expect(sendPushMock).toHaveBeenCalledTimes(1)
  })

  it('does NOT push for a non-transaction (added:false)', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: false })
    await POST(reqS(goodToken, 'Your OTP is 1234', 'email'))
    expect(pushRows).toHaveLength(0)
    expect(sendPushMock).not.toHaveBeenCalled()
  })

  it('does NOT push on a dedup re-POST', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 47500, currency: 'INR', direction: 'out', merchant: 'CRUNCHYROLL' })
    await POST(reqS(goodToken, 'Rs.475 spent CRUNCHYROLL dup', 'email'))
    sendPushMock.mockClear(); pushRows.length = 0
    const res2 = await POST(reqS(goodToken, 'Rs.475 spent CRUNCHYROLL dup', 'email'))
    expect((await res2.json() as { added: boolean }).added).toBe(false)
    expect(pushRows).toHaveLength(0)
    expect(sendPushMock).not.toHaveBeenCalled()
  })

  it('does NOT push in dryRun', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 47500, currency: 'INR', direction: 'out', merchant: 'CRUNCHYROLL' })
    const dry = new Request('http://x/api/ingest/sms', {
      method: 'POST',
      headers: { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Rs.475 spent CRUNCHYROLL dry', source: 'email', dryRun: true }),
    })
    await POST(dry)
    expect(pushRows).toHaveLength(0)
    expect(sendPushMock).not.toHaveBeenCalled()
  })

  it('still returns added:true AND sends the push when the server projection fails', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 47500, currency: 'INR', direction: 'out', merchant: 'CRUNCHYROLL' })
    materializeMock.mockRejectedValueOnce(new Error('CHECK constraint failed: source IN (...)'))
    sendPushMock.mockClear()
    const res = await POST(reqS(goodToken, 'Rs.475 spent CRUNCHYROLL projection-down', 'email'))
    expect(res.status).toBe(200)
    expect((await res.json() as { added: boolean }).added).toBe(true)
    expect(opLog).toHaveLength(1)
    expect(sendPushMock).toHaveBeenCalledTimes(1)
  })

  it('still returns added:true when the push send throws', async () => {
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 47500, currency: 'INR', direction: 'out', merchant: 'CRUNCHYROLL' })
    sendPushMock.mockRejectedValueOnce(new Error('push down'))
    const res = await POST(reqS(goodToken, 'Rs.475 spent CRUNCHYROLL boom', 'email'))
    expect((await res.json() as { added: boolean }).added).toBe(true)
    expect(opLog).toHaveLength(1)
  })

  it('sets account_id when account match_hints match the text', async () => {
    accountsRows = [
      { id: 'acc-1', user_id: U, name: 'HDFC Card', match_hints: '5678, hdfc', is_archived: 0, deleted_at: null, created_at: '2026-01-01T00:00:00Z' },
    ]
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 50000, currency: 'INR', direction: 'out', merchant: 'AMAZON' })
    const res = await POST(reqS(goodToken, 'Spent Rs 500 on HDFC Card XX5678'))
    expect((await res.json() as { added: boolean }).added).toBe(true)
    expect(opLog).toHaveLength(1)
    const payload = JSON.parse(String(opLog[0].payload)) as { account_id?: string }
    expect(payload.account_id).toBe('acc-1')
  })

  it('sets account_id to null when no account matches', async () => {
    accountsRows = [
      { id: 'acc-1', user_id: U, name: 'HDFC Card', match_hints: '5678', is_archived: 0, deleted_at: null, created_at: '2026-01-01T00:00:00Z' },
    ]
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 50000, currency: 'INR', direction: 'out', merchant: 'AMAZON' })
    const res = await POST(reqS(goodToken, 'Spent Rs 500 on AMEX Card'))
    expect((await res.json() as { added: boolean }).added).toBe(true)
    expect(opLog).toHaveLength(1)
    const payload = JSON.parse(String(opLog[0].payload)) as { account_id?: unknown }
    expect(payload.account_id).toBeNull()
  })

  it('does not match archived accounts even if hints match', async () => {
    accountsRows = [
      { id: 'acc-1', user_id: U, name: 'Old Card', match_hints: 'hdfc', is_archived: 1, deleted_at: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 'acc-2', user_id: U, name: 'Active Card', match_hints: 'amex', is_archived: 0, deleted_at: null, created_at: '2026-01-02T00:00:00Z' },
    ]
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 50000, currency: 'INR', direction: 'out', merchant: 'AMAZON' })
    const res = await POST(reqS(goodToken, 'Spent Rs 500 on HDFC Card'))
    expect((await res.json() as { added: boolean }).added).toBe(true)
    expect(opLog).toHaveLength(1)
    const payload = JSON.parse(String(opLog[0].payload)) as { account_id?: unknown }
    expect(payload.account_id).toBeNull()
  })

  it('includes matched account_id in dryRun response', async () => {
    accountsRows = [
      { id: 'acc-1', user_id: U, name: 'HDFC Card', match_hints: '5678', is_archived: 0, deleted_at: null, created_at: '2026-01-01T00:00:00Z' },
    ]
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 50000, currency: 'INR', direction: 'out', merchant: 'AMAZON' })
    const dryReq = new Request('http://x/api/ingest/sms', {
      method: 'POST',
      headers: { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Spent Rs 500 on HDFC Card XX5678', dryRun: true }),
    })
    const res = await POST(dryReq)
    const body = await res.json() as { payload?: { account_id?: string } }
    expect(body.payload?.account_id).toBe('acc-1')
  })

  it('matches by the last-4 in the account NAME when no hints are set', async () => {
    accountsRows = [
      { id: 'acc-debit', user_id: U, name: 'HDFC Debit 1234', match_hints: null, is_archived: 0, deleted_at: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 'acc-neo', user_id: U, name: 'Tata Neo 5872', match_hints: null, is_archived: 0, deleted_at: null, created_at: '2026-01-02T00:00:00Z' },
    ]
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 47500, currency: 'INR', direction: 'out', merchant: 'CRUNCHYROLL' })
    await POST(reqS(goodToken, 'Rs.475.00 spent on your HDFC Bank Credit Card ending 5872 at CRUNCHYROLL'))
    const payload = JSON.parse(String(opLog[0].payload)) as { account_id?: string }
    expect(payload.account_id).toBe('acc-neo')
  })

  it('does not tag an account whose last-4 only appears as the amount', async () => {
    accountsRows = [
      { id: 'acc-neo', user_id: U, name: 'Tata Neo 5872', match_hints: null, is_archived: 0, deleted_at: null, created_at: '2026-01-02T00:00:00Z' },
    ]
    parseSmsMock.mockResolvedValue({ is_transaction: true, amount: 587200, currency: 'INR', direction: 'out', merchant: 'SHOP' })
    await POST(reqS(goodToken, 'Rs 5872.00 debited at SHOP'))
    const payload = JSON.parse(String(opLog[0].payload)) as { account_id?: unknown }
    expect(payload.account_id).toBeNull()
  })
})
