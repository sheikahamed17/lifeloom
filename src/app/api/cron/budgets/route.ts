import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database } from '@cloudflare/workers-types'
import { createDb } from '@/lib/db'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { sendPushToUser } from '@/lib/web-push'
import { convertViaRates, parseFxOverrides } from '@/lib/fx'
import { computeBudgetProgress, yearMonthInTz } from '@/lib/budget-exec'
import { withYourShare } from '@/lib/shares'
import type { BudgetRow, MoneyEntryRow } from '@/lib/dexie'

export const dynamic = 'force-dynamic'

const THRESHOLDS = [80, 100] as const

export async function POST(req: Request) {
  const { env } = getCloudflareContext()
  const cfEnv = env as { CRON_SECRET?: string; DB: D1Database; VAPID_PRIVATE_KEY?: string; VAPID_PUBLIC_KEY?: string }
  if (!isAuthorizedCron(req, cfEnv)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const db = createDb(cfEnv.DB)
  const now = new Date().toISOString()

  const budgets = await db.selectFrom('budgets').where('deleted_at', 'is', null).selectAll().execute()
  const byUser = new Map<string, typeof budgets>()
  for (const b of budgets) {
    const list = byUser.get(b.user_id) ?? []
    list.push(b)
    byUser.set(b.user_id, list)
  }

  const fxRates = await db.selectFrom('fx_rates').select(['date', 'target', 'rate']).execute()
  let alertsCreated = 0
  const usersToPush = new Set<string>()

  for (const [userId, userBudgets] of byUser) {
    const prefs = await db.selectFrom('user_prefs').where('user_id', '=', userId).selectAll().executeTakeFirst()
    const primary = prefs?.primary_currency ?? 'INR'
    const tz = prefs?.tz ?? 'Asia/Kolkata'
    const fxOverrides = parseFxOverrides(prefs?.fx_overrides)
    const monthKey = yearMonthInTz(now, tz)

    const moneyRaw = await db.selectFrom('money_entries')
      .where('user_id', '=', userId)
      .where('direction', '=', 'out')
      .where('deleted_at', 'is', null)
      .selectAll()
      .execute() as unknown as MoneyEntryRow[]

    // Budgets count your share of a shared entry, not what others owe you.
    const shares = await db.selectFrom('expense_shares')
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .selectAll()
      .execute()
    const money = withYourShare(moneyRaw, shares)

    const toPrimary = (e: MoneyEntryRow): number => {
      if (e.currency === primary) return e.amount
      const conv = convertViaRates(e.amount, e.currency, primary, e.occurred_at, fxRates, fxOverrides)
      return conv ? conv.amount : e.amount
    }

    const progress = computeBudgetProgress(money, userBudgets as unknown as BudgetRow[], monthKey, tz, toPrimary)

    const divisor = primary === 'JPY' ? 1 : 100
    for (const p of progress) {
      for (const threshold of THRESHOLDS) {
        if (p.pct < threshold) continue
        const notifId = `budget-${p.categoryId}-${monthKey}-${threshold}`
        const exists = await db.selectFrom('push_notifications').where('id', '=', notifId).select('id').executeTakeFirst()
        if (exists) continue
        const cat = await db.selectFrom('categories').where('id', '=', p.categoryId).select('name').executeTakeFirst()
        await db.insertInto('push_notifications').values({
          id: notifId,
          user_id: userId,
          title: `Budget alert: ${cat?.name ?? 'category'} at ${p.pct}%`,
          body: `${(p.spent / divisor).toFixed(0)} of ${(p.limit / divisor).toFixed(0)} this month`,
          url: '/app?tab=money',
          created_at: now,
          read_at: null,
        }).execute()
        alertsCreated++
        usersToPush.add(userId)
      }
    }
  }

  let usersPushed = 0
  for (const userId of usersToPush) {
    try {
      await sendPushToUser(db, { VAPID_PRIVATE_KEY: cfEnv.VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY: cfEnv.VAPID_PUBLIC_KEY }, userId)
      usersPushed++
    } catch (err) {
      console.error(`/api/cron/budgets: sendPushToUser failed for ${userId}:`, err)
    }
  }

  return NextResponse.json({ alerts_created: alertsCreated, users_pushed: usersPushed })
}
