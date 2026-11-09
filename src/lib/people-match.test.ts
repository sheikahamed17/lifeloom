import { describe, it, expect } from 'vitest'
import { matchPeople, matchPerson } from './people-match'

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
