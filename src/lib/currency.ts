const SYMBOLS: Record<string, string> = {
  INR: '₹', USD: '$', EUR: '€', GBP: '£',
  AED: 'د.إ', SGD: 'S$', JPY: '¥', AUD: 'A$', CAD: 'C$',
}

export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? code
}

/** Minor units → "₹1,234.5" / "¥1500" (JPY has no minor unit). */
export function formatMinor(minor: number, currency: string, maximumFractionDigits = 2): string {
  const major = minor / (currency === 'JPY' ? 1 : 100)
  return `${currencySymbol(currency)}${major.toLocaleString(undefined, { maximumFractionDigits })}`
}
