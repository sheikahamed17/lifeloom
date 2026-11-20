import { parseAmountInput } from '@/lib/parse-amount'

const SYMBOLS: Record<string, string> = {
  INR: '₹', USD: '$', EUR: '€', GBP: '£',
  AED: 'د.إ', SGD: 'S$', JPY: '¥', AUD: 'A$', CAD: 'C$',
}

export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? code
}

/** Stored minor units per major unit: JPY has no minor unit (¥1500 is stored as 1500); the rest are ×100. */
export function minorPerMajor(currency: string): number {
  return currency === 'JPY' ? 1 : 100
}

/** Minor units → "₹1,234.5" / "¥1500" (JPY has no minor unit); negatives read "−₹8,500", never "₹-8,500". */
export function formatMinor(minor: number, currency: string, maximumFractionDigits = 2): string {
  const major = minor / minorPerMajor(currency)
  const sign = major < 0 ? '−' : ''
  return `${sign}${currencySymbol(currency)}${Math.abs(major).toLocaleString(undefined, { maximumFractionDigits })}`
}

/** Minor units → the figure without its symbol ("1,500"), for text that puts the symbol itself. */
export function formatMajor(minor: number, currency: string, maximumFractionDigits = 2): string {
  return (minor / minorPerMajor(currency)).toLocaleString(undefined, { maximumFractionDigits })
}

/** Minor units → the plain text an amount field shows ("250.5", "1500"); blank for 0. Reads back with `parseAmountFor`. */
export function amountText(minor: number, currency: string): string {
  return minor > 0 ? String(minor / minorPerMajor(currency)) : ''
}

/** Typed amount text → stored minor units in `currency` (JPY whole yen), or null when empty/invalid/negative. */
export function parseAmountFor(text: string, currency: string): number | null {
  const hundredths = parseAmountInput(text)   // the typed major amount × 100
  if (hundredths === null) return null
  return Math.round((hundredths * minorPerMajor(currency)) / 100)
}
