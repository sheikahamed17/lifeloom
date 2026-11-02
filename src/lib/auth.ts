import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import { passkey } from '@better-auth/passkey'
import { kyselyAdapter } from '@better-auth/kysely-adapter'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { z } from 'zod'
import { createDb } from '@/lib/db'
import { sendMagicLinkEmail } from '@/lib/email'
import { isDemoMode, DEMO_USER } from '@/lib/demo'
import type { D1Database } from '@cloudflare/workers-types'

// Auth secrets live in the Workers runtime env (set via `wrangler secret put`
// or wrangler.toml [vars]), NOT in Node's process.env. Dashboard-set Secrets
// only populate the Workers env, so we read from getCloudflareContext().env
// directly instead of going through @/lib/env (which reads process.env and
// is only correct for Node-runtime tests).
//
// Validation mirrors the schema in src/lib/env.ts so the two runtimes
// enforce the same invariants (length floor for the secret, URL shape).
const AuthEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be ≥ 32 chars'),
  BETTER_AUTH_URL: z.string().url(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
})

type AuthEnvBindings = {
  DB: D1Database
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  AUTH_VALIDATE_SCHEMA?: string   // 'true' → Better Auth's per-request schema check (tests only)
}

function buildAuth() {
  const cfEnv = getCloudflareContext().env as CloudflareEnv & AuthEnvBindings

  const parsed = AuthEnvSchema.safeParse({
    BETTER_AUTH_SECRET: cfEnv.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: cfEnv.BETTER_AUTH_URL,
    RESEND_API_KEY: cfEnv.RESEND_API_KEY,
    EMAIL_FROM: cfEnv.EMAIL_FROM,
  })
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(i => `${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(
      `Invalid Workers env for auth:\n${issues}\n\nFix by running locally:\n  pnpm exec wrangler secret put BETTER_AUTH_SECRET\n  pnpm exec wrangler secret put BETTER_AUTH_URL`,
    )
  }

  const db = createDb(cfEnv.DB)

  return betterAuth({
    secret: parsed.data.BETTER_AUTH_SECRET,
    baseURL: parsed.data.BETTER_AUTH_URL,
    database: kyselyAdapter(db, { type: 'sqlite' }),
    // Read the real client IP from Cloudflare's standard header so Better
    // Auth's rate limiter can bucket per-IP instead of falling back to a
    // single global per-path bucket. Without this, the deployed Worker logs
    // a warning on every sign-in: "Rate limiting could not determine a
    // client IP and is falling back to a single shared per-path bucket".
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip'],
      },
      // Better Auth ≥1.7 re-validates the DB schema on every request, and
      // buildAuth() runs per request, so its cache never survives: ~4× the CPU
      // of a plain get-session (measured), which pushed requests past the
      // Workers Free plan's 10 ms limit (503 "exceeded CPU time limit"). The
      // schema is instead verified in CI by tests/lib/auth-real-schema.test.ts,
      // which opts back in via AUTH_VALIDATE_SCHEMA against the real migrations.
      database: {
        validateSchema: cfEnv.AUTH_VALIDATE_SCHEMA === 'true',
      },
    },
    // Better Auth defaults to camelCase column names (expiresAt, userId, etc.)
    // but our schema in migrations/0001_initial.sql uses snake_case to match
    // the sync engine tables (op_log, widgets, devices). Map Better Auth's
    // logical field names to our snake_case columns so the adapter generates
    // SQL that matches the actual DB shape.
    user: {
      fields: {
        emailVerified: 'email_verified',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 365, // 1 year — durable across daily PWA opens
      updateAge: 60 * 60 * 24,       // sliding refresh once per day
      fields: {
        userId: 'user_id',
        expiresAt: 'expires_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    account: {
      fields: {
        userId: 'user_id',
        accountId: 'account_id',
        providerId: 'provider_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    verification: {
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          const apiKey = parsed.data.RESEND_API_KEY
          const from = parsed.data.EMAIL_FROM
          if (!apiKey || !from) {
            // Email not configured (e.g. local dev) — log so the flow still works.
            console.log(`[magic-link] email not configured; link for ${email}: ${url}`)
            return
          }
          await sendMagicLinkEmail({ apiKey, from, to: email, url })
        },
      }),
      passkey({
        rpID: new URL(parsed.data.BETTER_AUTH_URL).hostname,
        rpName: 'Pulse',
        origin: parsed.data.BETTER_AUTH_URL,
      }),
    ],
  } satisfies BetterAuthOptions)
}

// Per-request handler — Cloudflare context not available at module load
export async function handler(req: Request) {
  // DEMO_MODE: no login/signup. Report the fixed demo user for the client's
  // get-session poll (so authClient.useSession resolves to the demo user and
  // never redirects to /login), and make sign-in/up/out inert.
  if (isDemoMode(getCloudflareContext().env as { DEMO_MODE?: string })) {
    const url = new URL(req.url)
    if (url.pathname.endsWith('/get-session')) {
      const nowIso = new Date().toISOString()
      const expiresAt = new Date(Date.now() + 31_536_000_000).toISOString() // +1y
      return Response.json({
        session: { id: 'demo-session', token: 'demo', userId: DEMO_USER.id, expiresAt, createdAt: nowIso, updatedAt: nowIso },
        user: { id: DEMO_USER.id, email: DEMO_USER.email, name: DEMO_USER.name, emailVerified: true, image: null, createdAt: nowIso, updatedAt: nowIso },
      })
    }
    if (url.pathname.includes('/sign-')) {
      return Response.json({ status: true })
    }
  }
  const auth = buildAuth()
  return auth.handler(req)
}

export async function getSession(req: Request) {
  const cfEnv = getCloudflareContext().env as CloudflareEnv & { DEMO_MODE?: string }
  if (isDemoMode(cfEnv)) {
    // DEMO_MODE: every visitor is the single fixed demo user — no real sign-in,
    // no magic link, no cookie. All demo data is shared (see src/lib/demo.ts).
    return {
      session: null,
      user: {
        id: DEMO_USER.id, email: DEMO_USER.email, name: DEMO_USER.name,
        emailVerified: true, image: null, createdAt: new Date(), updatedAt: new Date(),
      },
    } as unknown as Awaited<ReturnType<ReturnType<typeof buildAuth>['api']['getSession']>>
  }
  const auth = buildAuth()
  return auth.api.getSession({ headers: req.headers })
}
