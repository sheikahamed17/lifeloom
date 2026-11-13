import { describe, it, expect } from 'vitest'
import { buildSeeds } from '@/lib/demo-seed'
import { extractAlertIdentifiers, matchAccountFromText, planAccountBackfill, type MatchableAccount } from '@/lib/account-match'
import { pickDefaultAccountId } from '@/lib/default-account'
import { MoneyPayloadSchema } from '@/lib/op-schemas/money'
import { AccountPayloadSchema } from '@/lib/op-schemas/account'
import { PersonPayloadSchema } from '@/lib/op-schemas/person'
import { ExpenseSharePayloadSchema } from '@/lib/op-schemas/expense-share'
import { planSettlement } from '@/lib/shares'

// The demo must show what the real app would do with this data — so the seeded
// alerts are checked against the actual matcher, not hand-maintained claims.
describe('demo seed — account auto-pick showcase', () => {
  const seeds = buildSeeds()
  const accounts: MatchableAccount[] = seeds
    .filter(s => s.kind === 'account')
    .map(s => ({ id: s.id, name: s.payload.name as string, match_hints: (s.payload.match_hints as string | undefined) ?? null, is_archived: 0, created_at: s.at }))
  const alerts = seeds.filter(s => s.kind === 'money' && (s.payload.source === 'email' || s.payload.source === 'sms'))

  it('seeds valid account and money payloads', () => {
    for (const s of seeds.filter(x => x.kind === 'account')) expect(AccountPayloadSchema.safeParse(s.payload).success).toBe(true)
    for (const s of seeds.filter(x => x.kind === 'money')) expect(MoneyPayloadSchema.safeParse(s.payload).success).toBe(true)
  })

  it('seeds one person with one outstanding half-rent share that "Arun paid me 10000" settles exactly', () => {
    const people = seeds.filter(s => s.kind === 'person')
    const shares = seeds.filter(s => s.kind === 'expense_share')
    expect(people).toHaveLength(1)
    for (const p of people) expect(PersonPayloadSchema.safeParse(p.payload).success).toBe(true)
    for (const s of shares) expect(ExpenseSharePayloadSchema.safeParse(s.payload).success).toBe(true)
    const rent = seeds.find(s => s.kind === 'money' && s.id === (shares[0].payload.money_entry_id as string))
    expect(rent?.payload.amount).toBe(2000000)
    expect(planSettlement(shares.map(s => ({ shareId: s.id, amount: s.payload.amount as number })), 1000000)).toEqual([shares[0].id])
  })

  it('every tagged alert carries exactly the account the matcher picks from its text', () => {
    const tagged = alerts.filter(a => a.payload.account_id)
    expect(tagged.length).toBeGreaterThanOrEqual(3)
    for (const a of tagged) expect(matchAccountFromText(a.payload.raw_input as string, accounts)).toBe(a.payload.account_id)
  })

  it('has one unknown-card alert (pill) and exactly one matchable untagged alert (Past alerts)', () => {
    const untagged = alerts.filter(a => !a.payload.account_id)
    const unknown = untagged.filter(a => matchAccountFromText(a.payload.raw_input as string, accounts) === null)
    expect(unknown).toHaveLength(1)
    expect(extractAlertIdentifiers(unknown[0].payload.raw_input as string)).toEqual(['1188'])

    const plan = planAccountBackfill(
      alerts.map(a => ({ id: a.id, source: a.payload.source as string, raw_input: a.payload.raw_input as string, account_id: (a.payload.account_id as string | null) ?? null, deleted_at: null })),
      accounts,
    )
    expect(plan).toEqual([{ id: expect.any(String), account_id: 'demo-acct-card' }])
  })

  it('stars Everyday Bank as the default account', () => {
    const rows = seeds.filter(s => s.kind === 'account').map(s => ({
      id: s.id, is_default: s.payload.is_default as number | undefined, is_archived: 0, deleted_at: null, updated_at: s.at,
    }))
    expect(pickDefaultAccountId(rows)).toBe('demo-acct-bank')
  })
})

describe('demo seed — insights', () => {
  it('writes digest metrics the Insights card can read (no "₹NaN")', async () => {
    const { InsightPayloadSchema } = await import('@/lib/op-schemas/insight')
    const insights = buildSeeds().filter(s => s.kind === 'insight')
    expect(insights.length).toBeGreaterThan(0)
    for (const s of insights) {
      expect(InsightPayloadSchema.safeParse(s.payload).success).toBe(true)
      const m = JSON.parse(s.payload.metrics as string)
      expect(typeof m.spend_total).toBe('number')
      expect(typeof m.income_total).toBe('number')
    }
  })
})
