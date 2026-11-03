import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { migratedSqlite } from '../helpers/migrated-sqlite'
import { kyselyOverSqlite } from '../helpers/sqlite-kysely'

// Pulse is single-user: the first account is the owner, and nobody else can
// create one (see the "Single owner" comment in src/lib/auth.ts). These drive the
// REAL auth handler against the REAL migrated schema. With no Resend key set,
// sendMagicLink logs the link instead of emailing it, so "a link was sent" means
// "a verify URL was logged".
const BASE = 'https://pulse.example.test'
const SECRET_ENV = { DB: {}, BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: BASE }
let db: ReturnType<typeof kyselyOverSqlite>
let env: Record<string, unknown>
let pending: Promise<unknown>[]   // work handed to ctx.waitUntil (runs after the response)
let logs: string[]
let errors: string[]

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env, ctx: { waitUntil: (p: Promise<unknown>) => { pending.push(p) } } }),
}))
vi.mock('@/lib/db', () => ({ createDb: () => db }))

async function auth() {
  return (await import('@/lib/auth')).handler
}

/** Ask for a sign-in link; returns the response and the logged verify URL, if any. */
async function requestLink(email: string, callbackURL = '/app') {
  const handler = await auth()
  const before = logs.length
  const res = await handler(new Request(`${BASE}/api/auth/sign-in/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ email, callbackURL }),
  }))
  const link = logs.slice(before).map(l => l.match(/https:\/\/\S+magic-link\/verify\S+/)?.[0]).find(Boolean)
  return { res, link }
}

async function follow(link: string) {
  const handler = await auth()
  return handler(new Request(link, { headers: { origin: BASE } }))
}

const addOwner = (email: string) =>
  db.insertInto('user').values({ id: 'owner', email, name: 'Owner', email_verified: 1, image: null, created_at: 0, updated_at: 0 }).execute()

const userCount = async () => Number((await db.selectFrom('user').select(eb => eb.fn.countAll().as('n')).executeTakeFirstOrThrow()).n)

describe('single owner', () => {
  beforeEach(() => {
    vi.resetModules()
    env = { ...SECRET_ENV }
    pending = []
    logs = []
    errors = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.join(' ')) })
    db = kyselyOverSqlite(migratedSqlite())
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('lets the first account sign up (the /setup wizard), and it becomes the owner', async () => {
    const { res, link } = await requestLink('owner@example.test', '/setup?welcome=1')
    expect(res.status).toBe(200)
    expect(link).toBeTruthy()
    const verify = await follow(link!)
    expect(verify.headers.get('set-cookie') ?? '').toMatch(/session_token=/)
    expect(await userCount()).toBe(1)
  }, 30000)

  it('sends no link to anyone else once an owner exists, and answers exactly as if it had', async () => {
    const owner = await requestLink('owner@example.test')
    await follow(owner.link!)

    const stranger = await requestLink('stranger@example.test')
    expect(stranger.res.status).toBe(owner.res.status)
    expect(await stranger.res.json()).toEqual({ status: true })   // nothing reveals the owner's address
    expect(stranger.link).toBeUndefined()
    expect(logs.some(l => l.includes('[magic-link] not sent'))).toBe(true)
    expect(await userCount()).toBe(1)
  }, 30000)

  it('still sends the owner their link, whatever letter case they type', async () => {
    await follow((await requestLink('owner@example.test')).link!)
    const again = await requestLink('Owner@Example.TEST')
    expect(again.link).toBeTruthy()
    const verify = await follow(again.link!)
    expect(verify.headers.get('set-cookie') ?? '').toMatch(/session_token=/)
    expect(await userCount()).toBe(1)
  }, 30000)

  it('only sends a link its verify step can complete: a stored address with capitals gets none', async () => {
    // Better Auth stores emails lowercased and its verify matches exactly; a row
    // edited by hand to 'Owner@…' can't be found by verify, so don't send a link
    // that would only end in SIGNUP_CLOSED.
    await addOwner('Owner@Example.test')
    const { res, link } = await requestLink('owner@example.test')
    expect(res.status).toBe(200)
    expect(link).toBeUndefined()
  }, 30000)

  it('refuses a second account even from a link issued before the owner existed', async () => {
    // Both links are issued on a fresh instance; whoever verifies first is the owner.
    const first = await requestLink('owner@example.test')
    const second = await requestLink('stranger@example.test')
    expect(first.link && second.link).toBeTruthy()
    await follow(first.link!)

    const late = await follow(second.link!)
    expect(late.status).toBe(302)
    expect(late.headers.get('location') ?? '').toContain('error=SIGNUP_CLOSED')
    expect(late.headers.get('set-cookie') ?? '').not.toMatch(/session_token=[^;]/)
    expect(await db.selectFrom('user').select('email').execute()).toEqual([{ email: 'owner@example.test' }])
    expect(await db.selectFrom('session').select('id').execute()).toHaveLength(1)
  }, 30000)

  describe('with email configured (Resend)', () => {
    beforeEach(() => {
      env = { ...SECRET_ENV, RESEND_API_KEY: 're_test', EMAIL_FROM: 'Pulse <onboarding@resend.dev>' }
    })

    it("answers the owner without waiting for the email, so timing can't tell the owner from anyone else", async () => {
      await addOwner('owner@example.test')
      const fetchMock = vi.fn(() => new Promise<Response>(() => {}))   // Resend never answers
      vi.stubGlobal('fetch', fetchMock)

      const owner = await requestLink('owner@example.test')            // would hang if it awaited the send
      expect(owner.res.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]).toEqual(expect.arrayContaining(['https://api.resend.com/emails']))
      expect(pending).toHaveLength(1)                                  // the send finishes after the response

      const stranger = await requestLink('stranger@example.test')
      expect(stranger.res.status).toBe(200)
      expect(await stranger.res.json()).toEqual(await owner.res.json())
      expect(fetchMock).toHaveBeenCalledTimes(1)                       // no email for the stranger
      expect(pending).toHaveLength(1)
    }, 30000)

    it('logs a send that fails after the response instead of failing the request', async () => {
      await addOwner('owner@example.test')
      vi.stubGlobal('fetch', vi.fn(async () => new Response('quota exceeded', { status: 429 })))
      const { res } = await requestLink('owner@example.test')
      expect(res.status).toBe(200)
      await Promise.all(pending)
      expect(errors.some(e => e.includes('[magic-link] email send failed') && e.includes('429'))).toBe(true)
    }, 30000)

    it('waits for the first account’s email, so the setup wizard can show a Resend problem', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid key', { status: 403 })))
      const { res } = await requestLink('owner@example.test', '/setup?welcome=1')
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(pending).toHaveLength(0)
    }, 30000)
  })
})
