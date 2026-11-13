const SYMBOLS: Record<string, string> = {
  INR: '₹', USD: '$', EUR: '€', GBP: '£',
  AED: 'د.إ', SGD: 'S$', JPY: '¥', AUD: 'A$', CAD: 'C$',
}

export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? code
}

/** Minor units → "₹1,234.5" / "¥1500" (JPY has no minor unit); negatives read "−₹8,500", never "₹-8,500". */
export function formatMinor(minor: number, currency: string, maximumFractionDigits = 2): string {
  const major = minor / (currency === 'JPY' ? 1 : 100)
  const sign = major < 0 ? '−' : ''
  return `${sign}${currencySymbol(currency)}${Math.abs(major).toLocaleString(undefined, { maximumFractionDigits })}`
}
