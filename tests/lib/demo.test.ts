import { describe, it, expect } from 'vitest'
import { isDemoMode, cannedAgentResponse, demoLimitedResponse, thisMonthPeriod, DEMO_EXAMPLES } from '@/lib/demo'
import { isQueryPlan } from '@/lib/query-plans'

describe('isDemoMode — defaults OFF everywhere except the demo deploy', () => {
  it('true only when DEMO_MODE is truthy', () => {
    expect(isDemoMode({ DEMO_MODE: 'true' })).toBe(true)
    expect(isDemoMode({ DEMO_MODE: true })).toBe(true)
  })
  it('false/off for prod + every self-hoster (unset, empty, false)', () => {
    expect(isDemoMode({ DEMO_MODE: 'false' })).toBe(false)
    expect(isDemoMode({ DEMO_MODE: '' })).toBe(false)
    expect(isDemoMode({})).toBe(false)
    expect(isDemoMode(null)).toBe(false)
    expect(isDemoMode(undefined)).toBe(false)
  })
})

describe('cannedAgentResponse — AI works with zero Groq quota', () => {
  const cats = [{ id: 'c-dining', name: 'Dining', kind: 'spend' as const }]
  const now = '2026-09-16T12:00:00.000Z'

  it('returns a money draft for a suggested phrase, resolving the live category', () => {
    const r = cannedAgentResponse('lunch 240', cats, now)
    expect(r?.intent).toBe('log_money')
    expect(r?.payload).toMatchObject({ kind: 'money', amount: 24000, category_id: 'c-dining', direction: 'out' })
  })

  it('is case- and whitespace-insensitive', () => {
    expect(cannedAgentResponse('  LUNCH   240 ', cats, now)?.intent).toBe('log_money')
  })

  it('returns a query plan for suggested questions (executed locally over seeded data)', () => {
    expect(cannedAgentResponse('total spend this month', cats, now)?.payload).toMatchObject({ kind: 'query_money', mode: 'total' })
    expect(cannedAgentResponse("what's overdue?", cats, now)?.payload).toMatchObject({ kind: 'query_task', status: 'overdue' })
  })

  it('the money query carries the current month as its period (a null period crashed the answer card)', () => {
    const payload = cannedAgentResponse('total spend this month', cats, now)?.payload
    expect(isQueryPlan(payload)).toBe(true)
    expect(payload).toMatchObject({
      period: { from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z', label: 'this month' },
    })
    expect(payload).not.toHaveProperty('bucket')
  })

  it('thisMonthPeriod rolls over the year in December', () => {
    expect(thisMonthPeriod('2026-12-31T23:59:59.000Z')).toEqual({
      from: '2026-12-01T00:00:00.000Z', to: '2027-01-01T00:00:00.000Z', label: 'this month',
    })
  })

  it('returns null for input outside the examples', () => {
    expect(cannedAgentResponse('buy a yacht for 2 crore', cats, now)).toBeNull()
  })

  it('every advertised DEMO_EXAMPLE has a working canned response', () => {
    for (const ex of DEMO_EXAMPLES) {
      expect(cannedAgentResponse(ex, cats, now), `no canned response for "${ex}"`).not.toBeNull()
    }
  })
})

describe('demoLimitedResponse', () => {
  it('flags demoLimited with a null payload (UI shows the deploy-your-own message)', () => {
    expect(demoLimitedResponse('anything')).toMatchObject({ intent: null, payload: null, demoLimited: true })
  })
})
