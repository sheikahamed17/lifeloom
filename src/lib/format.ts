// Wraps Intl.DateTimeFormat with a safe-fallback to UTC for invalid timezones.
// Intl throws RangeError on bogus TZ strings; user_prefs.tz could in theory
// be corrupted, so we want a graceful degrade rather than a crash mid-render.

// One date format app-wide (UX pass, 13 Nov 2026): "10 Nov 2026", and
// "10 Nov 2026, 14:30" with a time. The locale is pinned to en-GB so the
// day-month-year order never depends on the browser's language.
const LOCALE = 'en-GB'

/** A bare YYYY-MM-DD is a calendar day, not an instant: read it at UTC noon and format in UTC. */
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function formatLocalDate(iso: string, tz: string, opts?: Intl.DateTimeFormatOptions): string {
  const dayOnly = DAY_ONLY.test(iso)
  const date = new Date(dayOnly ? `${iso}T12:00:00.000Z` : iso)
  const zone = dayOnly ? 'UTC' : tz
  try {
    return new Intl.DateTimeFormat(LOCALE, { timeZone: zone, ...opts }).format(date)
  } catch {
    return new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', ...opts }).format(date)
  }
}

export function formatLocalDateTime(iso: string, tz: string): string {
  return formatLocalDate(iso, tz, { dateStyle: 'medium', timeStyle: 'short', hour12: false })
}

export function formatLocalDateOnly(iso: string, tz: string): string {
  return formatLocalDate(iso, tz, { dateStyle: 'medium' })
}

/** The app's one day format: "10 Nov 2026". */
export function formatDay(iso: string, tz = 'UTC'): string {
  return formatLocalDate(iso, tz, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "3–10 Nov 2026", "28 Oct – 3 Nov 2026", or "29 Dec 2025 – 4 Jan 2026". */
export function formatDayRange(startIso: string, endIso: string, tz = 'UTC'): string {
  const part = (iso: string, opts: Intl.DateTimeFormatOptions) => formatLocalDate(iso, tz, opts)
  const [sy, ey] = [part(startIso, { year: 'numeric' }), part(endIso, { year: 'numeric' })]
  const [sm, em] = [part(startIso, { month: 'short' }), part(endIso, { month: 'short' })]
  const sd = part(startIso, { day: 'numeric' })
  if (sy !== ey) return `${formatDay(startIso, tz)} – ${formatDay(endIso, tz)}`
  if (sm !== em) return `${sd} ${sm} – ${formatDay(endIso, tz)}`
  return `${sd}–${formatDay(endIso, tz)}`
}
