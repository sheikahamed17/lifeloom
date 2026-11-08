import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'
import { sendPushToUser } from '@/lib/web-push'

export const dynamic = 'force-dynamic'

/**
 * POST /api/push/test — send a test push to the caller's own subscriptions.
 *
 * Session-authenticated; self-targeted only (a user can only wake their own
 * devices). Enables one-call end-to-end verification of the push pipeline
 * (VAPID signing → push service → device wake → service-worker pull → display)
 * from a real device, since there is otherwise no way to trigger a push
 * outside the CRON_SECRET-gated crons.
 *
 * Pull-on-push: the wake-up push carries no payload, so we first seed a
 * "Lifeloom test" notification row for the service worker to fetch and display
 * when it wakes. Returns how many subscriptions were found and woken.
 */
export async function POST(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { env } = getCloudflareContext()
  const cfEnv = env as { DB: D1Database; VAPID_PRIVATE_KEY?: string; VAPID_PUBLIC_KEY?: string }
  const db = createDb(cfEnv.DB)
  const userId = session.user.id

  const subs = await db
    .selectFrom('push_subscriptions')
    .where('user_id', '=', userId)
    .select('id')
    .execute()

  if (subs.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        subscriptions: 0,
        sent: 0,
        pruned: 0,
        hint: 'No push subscriptions for this user — enable notifications in the app first.',
      },
      { status: 409 },
    )
  }

  await db
    .insertInto('push_notifications')
    .values({
      id: `test-${crypto.randomUUID()}`,
      user_id: userId,
      title: 'Lifeloom test 🔔',
      body: 'Push notifications are working.',
      url: '/app',
      created_at: new Date().toISOString(),
      read_at: null,
    })
    .execute()

  const { sent, pruned } = await sendPushToUser(
    db,
    { VAPID_PRIVATE_KEY: cfEnv.VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY: cfEnv.VAPID_PUBLIC_KEY },
    userId,
  )

  return NextResponse.json({ ok: sent > 0, subscriptions: subs.length, sent, pruned })
}
