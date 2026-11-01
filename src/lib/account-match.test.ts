import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  matchAccountFromText,
  extractAlertIdentifiers,
  accountTokens,
  addHintDigits,
  planAccountBackfill,
  type MatchableAccount,
  type BackfillableEntry,
} from './account-match';

const acc = (over: Partial<MatchableAccount> & { id: string }): MatchableAccount => ({
  name: '',
  match_hints: null,
  is_archived: 0,
  created_at: '2025-01-01T00:00:00Z',
  ...over,
});

describe('extractAlertIdentifiers', () => {
  // Real-world HDFC / Indian bank alert shapes.
  it.each([
    ['Rs.475.00 spent on your HDFC Bank Credit Card ending 5872 at CRUNCHYROLL on 01-08-26', ['5872']],
    ['Your Crunchyroll bill via E-mandate has been successfully paid using your HDFC Bank Credit Card ending 5872. Amount: INR 475.00', ['5872']],
    ['Sent Rs.500 From HDFC Bank A/C x1234 To AMAZON On 03-08 UPI Ref 401234567890', ['1234']],
    ['Rs.2,000.00 credited to your A/C XX1234 by salary', ['1234']],
    ['Thank you for using your HDFC Bank Debit Card ending in 9876 for Rs 250', ['9876']],
    ['Rs.1500 debited from A/c **1234 on 14-10-26', ['1234']],
    ['Your A/c XXXXXXXX1234 is debited for INR 300.00', ['1234']],
    ['Spent Rs 500 on HDFC Card XX5678', ['5678']],
    ['Card no. XX5872 used for INR 99', ['5872']],
    ['Debited from account ...4321 Rs 10', ['4321']],
    ['Paid from Account 4321 via NEFT', ['4321']],
    ['A/c no. 1234 credited with Rs 5', ['1234']],
    ['Txn on card •5872 of Rs 12', ['5872']],
    ['Masked A/c XX501234 debited', ['1234']],
  ])('%s', (text, expected) => {
    expect(extractAlertIdentifiers(text)).toEqual(expected);
  });

  it('ignores amounts, refs, dates and years', () => {
    expect(extractAlertIdentifiers('Rs 5872.00 spent at SHOP on 2026-10-14')).toEqual([]);
    expect(extractAlertIdentifiers('INR 5872 paid. UPI Ref 401258721234')).toEqual([]);
    expect(extractAlertIdentifiers('Rs.15872 debited')).toEqual([]);
  });

  it('does not treat a word ending in x as a mask', () => {
    expect(extractAlertIdentifiers('Spent at max 5872 store')).toEqual([]);
  });

  it('returns each identifier once, in order', () => {
    expect(extractAlertIdentifiers('From A/C x1234 to card ending 5872, A/C x1234')).toEqual(['1234', '5872']);
  });

  it('never extracts an identifier from a bare amount (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 999999 }), fc.constantFrom('Rs ', 'Rs.', 'INR ', '₹'), (n, cur) => {
        expect(extractAlertIdentifiers(`${cur}${n}.00 spent at SHOP`)).toEqual([]);
      }),
    );
  });

  it('always extracts last-4 of a masked identifier (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 9999 }),
        fc.constantFrom('x', 'XX', '**', 'ending ', 'A/c XX', 'Card no. XX'),
        (n, prefix) => {
          expect(extractAlertIdentifiers(`Rs 100 debited ${prefix}${n} today`)).toEqual([String(n)]);
        },
      ),
    );
  });
});

describe('accountTokens', () => {
  it('takes standalone 4-digit groups from the name as digit tokens', () => {
    expect(accountTokens(acc({ id: 'a', name: 'Tata Neo 5872' }))).toEqual({ digits: ['5872'], keywords: [] });
  });

  it('ignores digit runs in the name that are not exactly 4 long', () => {
    expect(accountTokens(acc({ id: 'a', name: 'Card 123 or 123456' }))).toEqual({ digits: [], keywords: [] });
  });

  it('splits hints into digit (last-4) and keyword tokens', () => {
    expect(accountTokens(acc({ id: 'a', name: 'HDFC', match_hints: '1234, 4111111111119876\nTata Neo, 12, x' }))).toEqual({
      digits: ['1234', '9876'],
      keywords: ['tata neo'],
    });
  });

  it('dedupes name and hint digits', () => {
    expect(accountTokens(acc({ id: 'a', name: 'Neo 5872', match_hints: '5872' })).digits).toEqual(['5872']);
  });
});

describe('matchAccountFromText', () => {
  it('matches an account by the last-4 in its NAME (no hints needed)', () => {
    const accounts = [acc({ id: 'neo', name: 'Tata Neo 5872' }), acc({ id: 'debit', name: 'HDFC Debit 1234' })];
    expect(matchAccountFromText('Rs.475.00 spent on your HDFC Bank Credit Card ending 5872 at X', accounts)).toBe('neo');
    expect(matchAccountFromText('Sent Rs.500 From HDFC Bank A/C x1234 To AMAZON', accounts)).toBe('debit');
  });

  it('matches a card account by last-4 hint', () => {
    expect(matchAccountFromText('Spent Rs 500 on HDFC Card XX5678', [acc({ id: 'acc-1', match_hints: '5678' })])).toBe('acc-1');
  });

  it('does NOT match a digit hint that only appears as an amount', () => {
    expect(matchAccountFromText('Rs 5872.00 spent at SHOP', [acc({ id: 'neo', name: 'Tata Neo 5872' })])).toBeNull();
  });

  it('matches keyword hints case-insensitively', () => {
    expect(matchAccountFromText('Payment via HDFC Credit Card', [acc({ id: 'acc-hdfc', match_hints: 'hdfc credit' })])).toBe('acc-hdfc');
  });

  it('returns null when no account matches', () => {
    expect(matchAccountFromText('Payment via HDFC Credit Card', [acc({ id: 'acc-1', match_hints: 'axis card' })])).toBeNull();
  });

  it('prefers a digit match over a keyword match', () => {
    const accounts = [
      acc({ id: 'kw', match_hints: 'hdfc', created_at: '2024-01-01T00:00:00Z' }),
      acc({ id: 'neo', name: 'Tata Neo 5872', created_at: '2025-01-01T00:00:00Z' }),
    ];
    expect(matchAccountFromText('HDFC Bank Credit Card ending 5872', accounts)).toBe('neo');
  });

  it('returns null on a tie instead of guessing', () => {
    const accounts = [acc({ id: 'a', match_hints: 'hdfc' }), acc({ id: 'b', match_hints: 'hdfc' })];
    expect(matchAccountFromText('Payment via HDFC', accounts)).toBeNull();
  });

  it('returns null when two accounts claim the same last-4', () => {
    const accounts = [acc({ id: 'a', name: 'Old 5872' }), acc({ id: 'b', match_hints: '5872' })];
    expect(matchAccountFromText('Card ending 5872', accounts)).toBeNull();
  });

  it('skips archived accounts even if their hints match', () => {
    const accounts = [acc({ id: 'acc-archived', match_hints: '5678', is_archived: 1 }), acc({ id: 'acc-active', match_hints: 'axis' })];
    expect(matchAccountFromText('Payment on card XX5678 and axis', accounts)).toBe('acc-active');
  });

  it('skips deleted accounts even if their hints match', () => {
    const accounts = [acc({ id: 'acc-deleted', match_hints: '5678', deleted_at: '2025-01-02T00:00:00Z' }), acc({ id: 'acc-active', match_hints: 'axis' })];
    expect(matchAccountFromText('Payment on card XX5678 and axis', accounts)).toBe('acc-active');
  });

  it('returns null when hints are null/empty and the name has no digits', () => {
    expect(matchAccountFromText('Spent Rs 500 on HDFC Card XX5678', [acc({ id: 'a', name: 'HDFC', match_hints: null })])).toBeNull();
    expect(matchAccountFromText('Spent Rs 500 on HDFC Card XX5678', [acc({ id: 'a', name: 'HDFC', match_hints: '' })])).toBeNull();
  });

  it('ignores 1-char tokens', () => {
    expect(matchAccountFromText('Payment on 5678', [acc({ id: 'acc-1', match_hints: '5' })])).toBeNull();
  });

  it('splits hints on comma and newline and trims', () => {
    const accounts = [acc({ id: 'acc-multi', match_hints: '  hdfc ,axis\nciti  ' })];
    expect(matchAccountFromText('Payment via axis', accounts)).toBe('acc-multi');
    expect(matchAccountFromText('Payment via citi', accounts)).toBe('acc-multi');
    expect(matchAccountFromText('Payment via HDFC', accounts)).toBe('acc-multi');
  });

  it('does not mutate input array', () => {
    const accounts = [acc({ id: 'b', match_hints: 'axis', created_at: '2025-02-01T00:00:00Z' }), acc({ id: 'a', match_hints: 'hdfc' })];
    const copy = JSON.parse(JSON.stringify(accounts));
    matchAccountFromText('Payment via HDFC', accounts);
    expect(accounts).toEqual(copy);
  });
});

describe('addHintDigits', () => {
  it('appends to empty hints', () => {
    expect(addHintDigits(null, '5872')).toBe('5872');
    expect(addHintDigits('  ', '5872')).toBe('5872');
  });

  it('appends with a comma separator', () => {
    expect(addHintDigits('tata neo', '5872')).toBe('tata neo, 5872');
  });

  it('returns null when the digits are already present (no-op)', () => {
    expect(addHintDigits('tata neo, 5872', '5872')).toBeNull();
  });

  it('returns null when the result would exceed 200 chars', () => {
    expect(addHintDigits('x'.repeat(196), '5872')).toBeNull();
  });
});

describe('planAccountBackfill', () => {
  const entry = (over: Partial<BackfillableEntry> & { id: string }): BackfillableEntry => ({
    source: 'email',
    raw_input: 'Rs.475.00 spent on your HDFC Bank Credit Card ending 5872',
    account_id: null,
    deleted_at: null,
    ...over,
  });
  const accounts = [acc({ id: 'neo', name: 'Tata Neo 5872' })];

  it('tags untagged sms/email entries whose raw text matches', () => {
    expect(planAccountBackfill([entry({ id: 'e1' }), entry({ id: 'e2', source: 'sms' })], accounts)).toEqual([
      { id: 'e1', account_id: 'neo' },
      { id: 'e2', account_id: 'neo' },
    ]);
  });

  it('never overwrites an existing account, and skips other sources / deleted / no raw text / no match', () => {
    expect(planAccountBackfill([
      entry({ id: 'tagged', account_id: 'other' }),
      entry({ id: 'manual', source: 'manual' }),
      entry({ id: 'gone', deleted_at: '2025-01-01T00:00:00Z' }),
      entry({ id: 'noraw', raw_input: null }),
      entry({ id: 'nomatch', raw_input: 'Card ending 0000' }),
    ], accounts)).toEqual([]);
  });
});
