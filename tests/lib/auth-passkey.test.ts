import { describe, it, expect, vi, beforeEach } from 'vitest'
import { migratedSqlite } from '../helpers/migrated-sqlite'
import { kyselyOverSqlite } from '../helpers/sqlite-kysely'

// Better Auth ≥1.7 validates the schema on every request, so the plugin is
// exercised against the real migrated schema rather than an empty stub DB.
let db: ReturnType<typeof kyselyOverSqlite>

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({
    env: {
      DB: {} as unknown,
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      BETTER_AUTH_URL: 'https://pulse.sdsheikahamed.workers.dev',
    },
  }),
}))
vi.mock('@/lib/db', () => ({ createDb: () => db }))

describe('auth with passkey plugin', () => {
  beforeEach(() => {
    vi.resetModules()
    db = kyselyOverSqlite(migratedSqlite())
  })

  it('instantiates and exposes passkey generate-options endpoints', async () => {
    const { handler } = await import('@/lib/auth')
    // A GET to a passkey route should be handled (not 404) by the plugin.
    const res = await handler(new Request(
      'https://pulse.sdsheikahamed.workers.dev/api/auth/passkey/generate-register-options',
    ))
    expect(res.status).not.toBe(404)
    expect(res.status).not.toBe(500)   // e.g. a SchemaMismatchError from the 1.7 schema check
    // Full Better Auth instantiation (+ passkey/SimpleWebAuthn) is slow to
    // import; raise the 5s vitest default so it doesn't flake under load.
  }, 30000)
})
