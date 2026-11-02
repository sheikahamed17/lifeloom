import { describe, it, expect, vi, beforeEach } from 'vitest'
import { migratedSqlite } from '../helpers/migrated-sqlite'
import { kyselyOverSqlite } from '../helpers/sqlite-kysely'

// Better Auth ≥1.7 validates the database schema on every request and refuses
// all auth traffic (SchemaMismatchError) if it disagrees with the tables — so a
// dependency bump could lock you out of prod. This drives a full magic-link
// sign-in through the REAL auth config against the REAL migrated schema.
const URL_BASE = 'https://pulse.example.test'
let db: ReturnType<typeof kyselyOverSqlite>

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: { DB: {}, BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: URL_BASE } }),
}))
vi.mock('@/lib/db', () => ({ createDb: () => db }))

describe('auth against the real migrated D1 schema', () => {
  beforeEach(() => {
    vi.resetModules()
    db = kyselyOverSqlite(migratedSqlite())
  })

  it('passes the schema check and completes a magic-link sign-in', async () => {
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
    const { handler } = await import('@/lib/auth')

    // 1. Request a link (no Resend key in tests → the link is logged, not emailed).
    const send = await handler(new Request(`${URL_BASE}/api/auth/sign-in/magic-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: URL_BASE },
      body: JSON.stringify({ email: 'owner@example.test', callbackURL: '/app' }),
    }))
    expect(send.status, await send.clone().text()).toBe(200)
    const link = logs.map(l => l.match(/https:\/\/\S+magic-link\/verify\S+/)?.[0]).find(Boolean)
    expect(link).toBeTruthy()

    // 2. Follow it → user + session rows are written through the snake_case mapping.
    const verify = await handler(new Request(link!, { headers: { origin: URL_BASE } }))
    expect([200, 302]).toContain(verify.status)
    expect(verify.headers.get('set-cookie') ?? '').toMatch(/session_token=/)

    const user = await db.selectFrom('user').selectAll().where('email', '=', 'owner@example.test').executeTakeFirst()
    expect(user?.email_verified).toBe(1)
    const sessions = await db.selectFrom('session').selectAll().where('user_id', '=', user!.id).execute()
    expect(sessions).toHaveLength(1)
    spy.mockRestore()
  }, 30000)
})
