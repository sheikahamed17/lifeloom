import { describe, it, expect } from 'vitest'
import { matchPeople, matchPerson, suggestPayer, matchNames, withMatchName } from './people-match'

const people = [{ id: 'p-arun', name: 'Arun' }, { id: 'p-priya', name: 'Priya K' }]

describe('matchPeople', () => {
  it('maps heard names onto people case-insensitively and keeps unknown names as new (null id)', () => {
    expect(matchPeople([{ name: 'arun', amount: null }, { name: 'Ravi', amount: 50000 }], people)).toEqual([
      { person_id: 'p-arun', name: 'Arun', amount: null },
      { person_id: null, name: 'Ravi', amount: 50000 },
    ])
  })
  it('collapses duplicate names so a debt cannot be doubled', () => {
    expect(matchPeople([{ name: 'Arun', amount: 100 }, { name: ' ARUN ', amount: 200 }], people)).toHaveLength(1)
  })
  it('drops empty names', () => {
    expect(matchPeople([{ name: '  ', amount: null }], people)).toEqual([])
  })
})

describe('matchPerson', () => {
  it('finds one person or null', () => {
    expect(matchPerson('priya k', people)?.id).toBe('p-priya')
    expect(matchPerson('Nobody', people)).toBeNull()
  })
})

describe('suggestPayer (who a bank credit is from)', () => {
  const people = [
    { id: 'p-arun', name: 'Arun', match_names: null },
    { id: 'p-priya', name: 'Priya Raman', match_names: JSON.stringify(['PRIYA R']) },
    { id: 'p-ravi', name: 'Ravi', match_names: null },
  ]

  it('a remembered bank name wins, whatever its wording', () => {
    expect(suggestPayer('priya  r', people)).toEqual({ personId: 'p-priya', via: 'remembered' })
  })

  it('matches when every word of the person’s name is a whole word of the sender', () => {
    expect(suggestPayer('ARUN KUMAR S', people)).toEqual({ personId: 'p-arun', via: 'name' })
    expect(suggestPayer('Mr. Priya Raman', people)).toEqual({ personId: 'p-priya', via: 'name' })
  })

  it('does not match part of a word, a missing sender, or a tie between people', () => {
    expect(suggestPayer('ARUNACHALAM', people)).toBeNull()
    expect(suggestPayer(null, people)).toBeNull()
    expect(suggestPayer('   ', people)).toBeNull()
    expect(suggestPayer('ARUN RAVI', people)).toBeNull()
  })

  it('ignores archived and deleted people', () => {
    expect(suggestPayer('ARUN KUMAR', [{ id: 'p-arun', name: 'Arun', is_archived: 1 }])).toBeNull()
    expect(suggestPayer('ARUN KUMAR', [{ id: 'p-arun', name: 'Arun', deleted_at: 'x' }])).toBeNull()
  })
})

describe('matchNames / withMatchName (remembering bank names)', () => {
  it('reads a stored list, tolerating empty or damaged values', () => {
    expect(matchNames(JSON.stringify(['ARUN KUMAR S']))).toEqual(['ARUN KUMAR S'])
    expect(matchNames(null)).toEqual([])
    expect(matchNames('not json')).toEqual([])
    expect(matchNames(JSON.stringify([1, 'X']))).toEqual(['X'])
  })

  it('adds a new name, and returns null when it is already known (in any wording) or blank', () => {
    expect(withMatchName(null, 'ARUN KUMAR S')).toBe(JSON.stringify(['ARUN KUMAR S']))
    expect(withMatchName(JSON.stringify(['ARUN KUMAR S']), 'arun  kumar s')).toBeNull()
    expect(withMatchName(null, '  ')).toBeNull()
  })

  it('keeps the newest 10 names', () => {
    let stored: string | null = null
    for (let i = 0; i < 12; i++) stored = withMatchName(stored, `NAME ${i}`) ?? stored
    const list = matchNames(stored)
    expect(list).toHaveLength(10)
    expect(list[0]).toBe('NAME 2')
    expect(list[9]).toBe('NAME 11')
  })
})

describe('withMatchName limits', () => {
  it('keeps every stored list valid for the person schema (10 names, each cut to 50 chars)', async () => {
    const { PersonPayloadSchema } = await import('./op-schemas/person')
    let stored: string | null = null
    for (let i = 0; i < 12; i++) stored = withMatchName(stored, `${'X'.repeat(70)} ${i}`) ?? stored
    expect(matchNames(stored).every(n => n.length <= 50)).toBe(true)
    expect(PersonPayloadSchema.safeParse({ name: 'Arun', match_names: stored }).success).toBe(true)
  })
})
