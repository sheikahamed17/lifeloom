import { describe, it, expect } from 'vitest'
import { savedLabel, signedAmount } from '@/lib/capture-feedback'

describe('signedAmount', () => {
  it('uses a real minus sign for spend and a plus for income', () => {
    expect(signedAmount(12000, 'INR', 'out')).toBe('−₹120')
    expect(signedAmount(8500000, 'INR', 'in')).toBe('+₹85,000')
  })
  it('treats JPY as whole units', () => {
    expect(signedAmount(1500, 'JPY', 'out')).toBe('−¥1,500')
  })
})

describe('savedLabel', () => {
  it('names the amount and category of a saved spend', () => {
    expect(savedLabel({ kind: 'money', amount: 12000, currency: 'INR', direction: 'out', categoryName: 'Dining' })).toBe('Saved −₹120 · Dining')
  })
  it('omits a missing category', () => {
    expect(savedLabel({ kind: 'money', amount: 12000, currency: 'INR', direction: 'out', categoryName: null })).toBe('Saved −₹120')
  })
  it('states your share of a shared expense', () => {
    expect(savedLabel({ kind: 'money', amount: 2000000, currency: 'INR', direction: 'out', categoryName: 'Housing', yourShare: 1000000 }))
      .toBe('Saved −₹20,000 · Housing · you ₹10,000')
  })
  it('states the number of parts of a split', () => {
    expect(savedLabel({ kind: 'money', amount: 120000, currency: 'INR', direction: 'out', parts: 3 })).toBe('Saved −₹1,200 split 3 ways')
  })
  it('quotes a task title, shortened when long', () => {
    expect(savedLabel({ kind: 'task', title: 'Call mom' })).toBe('Task added: “Call mom”')
    expect(savedLabel({ kind: 'task', title: 'Renew the car insurance before the end of the month please' }))
      .toBe('Task added: “Renew the car insurance before the end…”')
  })
  it('labels notes, learnings, budgets, settlements and edits', () => {
    expect(savedLabel({ kind: 'note', title: null, body: 'Buy more coffee filters' })).toBe('Note saved: “Buy more coffee filters”')
    expect(savedLabel({ kind: 'learning' })).toBe('Saved to Learn')
    expect(savedLabel({ kind: 'budget', categoryName: 'Dining', amount: 500000, currency: 'INR' })).toBe('Budget set: Dining ₹5,000 a month')
    expect(savedLabel({ kind: 'settle', personName: 'Arun', amount: 1000000, currency: 'INR' })).toBe('Arun paid ₹10,000 · marked settled')
    expect(savedLabel({ kind: 'edit' })).toBe('Changes saved')
  })
})
