import { describe, it, expect } from 'vitest'
import { captureCategories, type CaptureCategory } from '@/lib/capture-categories'

const U = 'u1'
const cat = (id: string, name: string, kind: 'spend' | 'income', created_at: string): CaptureCategory => ({ id, name, kind, created_at })

describe('captureCategories', () => {
  it('keeps one category per name and kind, preferring the canonical id the client dedupe keeps', () => {
    const rows = [
      cat('uuid-old', 'Food', 'spend', '2026-01-01T00:00:00.000Z'),  // oldest, but not canonical
      cat(`cat-${U}-food`, 'Food', 'spend', '2026-06-01T00:00:00.000Z'),
      cat('uuid-newer', 'Food', 'spend', '2026-07-01T00:00:00.000Z'),
    ]
    expect(captureCategories(rows, U).map(c => c.id)).toEqual([`cat-${U}-food`])
  })

  it('falls back to the oldest copy, then the smallest id, when none is canonical', () => {
    const rows = [
      cat('b', 'Rent', 'spend', '2026-02-01T00:00:00.000Z'),
      cat('z', 'Rent', 'spend', '2026-01-01T00:00:00.000Z'),
      cat('a', 'Rent', 'spend', '2026-01-01T00:00:00.000Z'),
    ]
    expect(captureCategories(rows, U).map(c => c.id)).toEqual(['a'])
  })

  it('gives the same answer whatever order the database returns rows in', () => {
    const rows = [
      cat('uuid-1', 'Food', 'spend', '2026-03-01T00:00:00.000Z'),
      cat('uuid-2', 'Food', 'spend', '2026-02-01T00:00:00.000Z'),
      cat(`cat-${U}-salary`, 'Salary', 'income', '2026-01-01T00:00:00.000Z'),
      cat('uuid-3', 'Salary', 'income', '2026-01-01T00:00:00.000Z'),
    ]
    const expected = captureCategories(rows, U)
    expect(captureCategories([...rows].reverse(), U)).toEqual(expected)
    expect(captureCategories([rows[2], rows[0], rows[3], rows[1]], U)).toEqual(expected)
    expect(expected.map(c => c.id)).toEqual([`cat-${U}-salary`, 'uuid-2'])
  })

  it('treats the same name under a different kind as a different category', () => {
    const rows = [
      cat('s', 'Gift', 'spend', '2026-01-01T00:00:00.000Z'),
      cat('i', 'Gift', 'income', '2026-01-01T00:00:00.000Z'),
    ]
    expect(captureCategories(rows, U).map(c => `${c.kind}:${c.id}`)).toEqual(['income:i', 'spend:s'])
  })

  it('returns the list sorted by kind then name, so the AI prompt is stable too', () => {
    const rows = [
      cat('3', 'Travel', 'spend', '2026-01-01T00:00:00.000Z'),
      cat('1', 'Bills', 'spend', '2026-01-03T00:00:00.000Z'),
      cat('2', 'Salary', 'income', '2026-01-02T00:00:00.000Z'),
    ]
    expect(captureCategories(rows, U).map(c => c.name)).toEqual(['Salary', 'Bills', 'Travel'])
  })

  it('handles an empty list', () => {
    expect(captureCategories([], U)).toEqual([])
  })
})
