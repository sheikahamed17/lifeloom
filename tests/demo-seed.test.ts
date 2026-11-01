import { describe, it, expect } from 'vitest'
import { buildSeeds } from '@/lib/demo-seed'
import { extractAlertIdentifiers, matchAccountFromText, planAccountBackfill, type MatchableAccount } from '@/lib/account-match'
import { pickDefaultAccountId } from '@/lib/default-account'
import { MoneyPayloadSchema } from '@/lib/op-schemas/money'
import { AccountPayloadSchema } from '@/lib/op-schemas/account'

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
