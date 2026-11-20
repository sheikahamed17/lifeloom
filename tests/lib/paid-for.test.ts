import { describe, it, expect } from 'vitest'
import { amountInputText, checkPaidFor } from '@/lib/paid-for'

describe('checkPaidFor', () => {
  it('gives a known person the amount typed, by default the whole entry', () => {
    expect(checkPaidFor(60000, 'INR', { personId: 'p-arun', name: 'Arun', amountText: '600' })).toEqual({
      ok: true, rows: [{ person_id: 'p-arun', name: 'Arun', amount: 60000 }],
    })
  })

  it('names a new person by the typed name (created on save, not here)', () => {
    expect(checkPaidFor(60000, 'INR', { personId: null, name: '  Priya ', amountText: '250.50' })).toEqual({
      ok: true, rows: [{ person_id: null, name: 'Priya', amount: 25050 }],
    })
  })

  it('accepts part of the amount, with grouping commas', () => {
    const r = checkPaidFor(6000000, 'INR', { personId: 'p-arun', name: 'Arun', amountText: '10,000' })
    expect(r.ok && r.rows[0].amount).toBe(1000000)
  })

  it('says what is missing when it cannot be saved yet', () => {
    expect(checkPaidFor(60000, 'INR', { personId: null, name: '   ', amountText: '600' })).toEqual({ ok: false, problem: 'name' })
    expect(checkPaidFor(60000, 'INR', { personId: 'p-arun', name: 'Arun', amountText: '0' })).toEqual({ ok: false, problem: 'amount' })
    expect(checkPaidFor(60000, 'INR', { personId: 'p-arun', name: 'Arun', amountText: 'abc' })).toEqual({ ok: false, problem: 'amount' })
    expect(checkPaidFor(60000, 'INR', { personId: 'p-arun', name: 'Arun', amountText: '' })).toEqual({ ok: false, problem: 'amount' })
    expect(checkPaidFor(60000, 'INR', { personId: 'p-arun', name: 'Arun', amountText: '600.01' })).toEqual({ ok: false, problem: 'too-much' })
  })

  it('reads JPY as whole yen (no minor unit)', () => {
    expect(checkPaidFor(1500, 'JPY', { personId: 'p', name: 'Ken', amountText: '1500' })).toEqual({
      ok: true, rows: [{ person_id: 'p', name: 'Ken', amount: 1500 }],
    })
    expect(checkPaidFor(1500, 'JPY', { personId: 'p', name: 'Ken', amountText: '1501' })).toEqual({ ok: false, problem: 'too-much' })
  })
})

describe('amountInputText', () => {
  it('renders minor units as the text the amount field reads back', () => {
    expect(amountInputText(60000, 'INR')).toBe('600')
    expect(amountInputText(25050, 'INR')).toBe('250.5')
    expect(amountInputText(0, 'INR')).toBe('')
  })

  it('renders JPY as whole yen', () => {
    expect(amountInputText(1500, 'JPY')).toBe('1500')
  })
})
