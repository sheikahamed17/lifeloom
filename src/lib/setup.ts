// Pure helpers for the first-run setup wizard. Side-effect-free so the
// middleware gate and the /setup page can be unit-tested without a runtime.
//
// The hard gate (redirect to /setup until an owner exists) lives in
// middleware and is driven by `middlewareRedirect`. The wizard's own
// post-account behaviour lives in the /setup page and is driven by
// `setupStage`. The source of truth for both is "does a user row exist in D1",
// never a cookie or client flag.

// Paths that stay reachable while no user exists yet, so the visitor can reach
// the wizard AND actually create the first account (Better Auth's endpoints).
// Everything else is forced to /setup until an owner exists.
const SETUP_ALLOWLIST = ['/setup', '/api/setup', '/api/auth', '/api/health']

function isAllowlisted(pathname: string): boolean {
  return SETUP_ALLOWLIST.some(p => pathname === p || pathname.startsWith(p + '/'))
}

/**
 * The middleware first-run gate. Returns the path to redirect to, or null to
 * allow. Its ONLY job is the hard gate: while no user exists, force every
 * non-allowlisted route to the wizard. Once a user exists it allows everything
 * — the /setup page then self-manages via `setupStage` (which is why /setup
 * stays reachable for the magic-link return trip in the passkey-less first
 * sign-up).
 */
export function middlewareRedirect(params: { usersExist: boolean; pathname: string }): string | null {
  const { usersExist, pathname } = params
  if (usersExist) return null
  if (isAllowlisted(pathname)) return null
  return '/setup'
}

/**
 * What the /setup page should do, given the current state:
 * - 'create'   → no owner yet: show Welcome + Create-account (Steps 1-2).
 * - 'continue' → owner just created (authenticated) and returned via the
 *                magic-link callback (?welcome=1): show Verify-AI…Done (3-5).
 * - 'app'      → setup already done, or a stray visit: leave for /app, so the
 *                wizard never reappears once an owner exists.
 */
export type SetupStage = 'create' | 'continue' | 'app'

export function setupStage(params: { usersExist: boolean; authed: boolean; welcome: boolean }): SetupStage {
  const { usersExist, authed, welcome } = params
  if (!usersExist) return 'create'
  if (authed && welcome) return 'continue'
  return 'app'
}

/** Whether magic-link emails can actually be delivered (Resend configured). */
export function isEmailConfigured(env: { RESEND_API_KEY?: string | null; EMAIL_FROM?: string | null }): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)
}

/** The message the Create-account step shows after requesting a magic link. */
export function magicLinkSentMessage(emailConfigured: boolean): string {
  return emailConfigured
    ? 'Magic link sent. Check your inbox (and spam) for the sign-in link.'
    : "Email isn't configured yet. Check your deploy logs for the magic link (it's printed to the console when Resend isn't set up)."
}

export type AiCheckResult = { ok: true } | { ok: false; error: string }

/**
 * The Step-3 AI validation, decoupled from the Groq client so it's testable.
 * `listModels` performs the lightest real call that proves the key works
 * (a models list — no completion tokens); pass `null` when no key is set.
 */
export async function checkAi(listModels: (() => Promise<unknown>) | null): Promise<AiCheckResult> {
  if (!listModels) {
    return { ok: false, error: 'GROQ_API_KEY is not set on this instance. Add it, then retry.' }
  }
  try {
    await listModels()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message || 'Groq request failed.' }
  }
}
