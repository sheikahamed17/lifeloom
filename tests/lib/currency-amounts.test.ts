import { describe, it, expect } from 'vitest'
import { amountText, formatMajor, minorPerMajor, parseAmountFor } from '@/lib/currency'

describe('minorPerMajor', () => {
  it('is 1 for JPY (no minor unit) and 100 for everything else', () => {
    expect(minorPerMajor('JPY')).toBe(1)
    expect(minorPerMajor('INR')).toBe(100)
    expect(minorPerMajor('USD')).toBe(100)
  })
})

describe('parseAmountFor (typed text → stored minor units)', () => {
  it('multiplies by 100 for two-decimal currencies, with grouping commas', () => {
    expect(parseAmountFor('600', 'INR')).toBe(60000)
    expect(parseAmountFor('1,250.50', 'INR')).toBe(125050)
    expect(parseAmountFor('0.1', 'USD')).toBe(10)
  })

  it('reads JPY as whole yen', () => {
    expect(parseAmountFor('1500', 'JPY')).toBe(1500)
    expect(parseAmountFor('1,500', 'JPY')).toBe(1500)
    expect(parseAmountFor('1500.4', 'JPY')).toBe(1500)
  })

  it('returns null for empty, negative or unreadable text', () => {
    expect(parseAmountFor('', 'JPY')).toBeNull()
    expect(parseAmountFor('-5', 'INR')).toBeNull()
    expect(parseAmountFor('abc', 'JPY')).toBeNull()
  })
})

describe('amountText (stored minor units → the text an amount field shows)', () => {
  it('round-trips with parseAmountFor', () => {
    for (const [minor, currency] of [[60000, 'INR'], [125050, 'INR'], [1500, 'JPY'], [1, 'JPY']] as const) {
      expect(parseAmountFor(amountText(minor, currency), currency)).toBe(minor)
    }
  })

  it('shows JPY whole and leaves a zero amount blank', () => {
    expect(amountText(1500, 'JPY')).toBe('1500')
    expect(amountText(25050, 'INR')).toBe('250.5')
    expect(amountText(0, 'JPY')).toBe('')
  })
})

describe('formatMajor (a figure without the symbol, as the card prints it)', () => {
  it('divides by the currency’s minor unit', () => {
    expect(formatMajor(1500, 'JPY')).toBe((1500).toLocaleString())
    expect(formatMajor(150000, 'INR')).toBe((1500).toLocaleString())
  })
})
