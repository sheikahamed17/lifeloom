// Salary reminder: a monthly nudge to log salary on the last WORKING day of the
// month (income that arrives with no email/SMS, so nothing auto-ingests it).
// Pure + deterministic; the cron route and tests drive these.

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 'YYYY-MM-DD' of the last working day (Mon–Fri) of the given calendar month.
 * `month` is 1-based (1 = January). Public holidays are NOT considered (v1) —
 * this is purely the last weekday of the month.
 */
export function lastWorkingDayOfMonth(year: number, month: number): string {
  // Day 0 of the next month == the last day of THIS month.
  const lastDom = new Date(Date.UTC(year, month, 0)).getUTCDate()
  for (let d = lastDom; d >= 1; d--) {
    const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay() // 0 = Sun … 6 = Sat
    if (dow >= 1 && dow <= 5) {
      return `${year}-${pad(month)}-${pad(d)}`
    }
  }
  // Unreachable — no month is entirely weekend — but stay total.
  return `${year}-${pad(month)}-01`
}

/** The 'YYYY-MM-DD' calendar day of `nowIso` as seen in the IANA `tz`. */
export function localDay(nowIso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowIso))
}

/** True when, in the user's tz, today is the last working day of the month. */
export function isSalaryReminderDay(nowIso: string, tz: string): boolean {
  const today = localDay(nowIso, tz) // 'YYYY-MM-DD'
  const [y, m] = today.split('-').map(Number)
  return today === lastWorkingDayOfMonth(y, m)
}

export type SalaryReminder = {
  id: string
  title: string
  body: string
  url: string
}

/**
 * The reminder notification for a user on their salary-reminder day.
 * `id` is one-per-user-per-month (`salary-{userId}-{YYYY-MM}`) so the cron can
 * fire daily but dedup to at most one reminder per month.
 */
export function buildSalaryReminder(userId: string, nowIso: string, tz: string): SalaryReminder {
  const ym = localDay(nowIso, tz).slice(0, 7) // 'YYYY-MM'
  return {
    id: `salary-${userId}-${ym}`,
    title: '💰 Payday — log your salary',
    body: "It's the last working day of the month. Tap to add your salary in Lifeloom.",
    url: '/app?tab=money',
  }
}
