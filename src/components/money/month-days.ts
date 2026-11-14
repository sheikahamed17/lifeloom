import { formatLocalDate } from '@/lib/format'

/** Returns a function giving "YYYY-MM-DD" of an ISO instant as seen in `tz` (UTC when the tz is invalid). */
export function makeDayKeyer(tz: string): (iso: string) => string {
  const opts = { year: 'numeric', month: '2-digit', day: '2-digit' } as const
  let fmt: Intl.DateTimeFormat
  try {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, ...opts })
  } catch {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', ...opts })
  }
  return (iso: string) => {
    const date = new Date(iso)
    if (isNaN(date.getTime())) return ''
    const parts = fmt.formatToParts(date)
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
    return `${get('year')}-${get('month')}-${get('day')}`
  }
}

/** Days in a month; `month` is 1 to 12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** The day key `delta` days away from `key` ("YYYY-MM-DD"). */
export function shiftDayKey(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

/** "1st", "2nd", "14th". */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/** "Today, 14 Nov", "Yesterday, 13 Nov", "12 Nov", or "30 Dec 2025" for another year. */
export function dayHeading(key: string, todayKey: string): string {
  if (!key) return 'No date'
  const sameYear = key.slice(0, 4) === todayKey.slice(0, 4)
  const date = formatLocalDate(key, 'UTC', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
  if (key === todayKey) return `Today, ${date}`
  if (key === shiftDayKey(todayKey, -1)) return `Yesterday, ${date}`
  return date
}
