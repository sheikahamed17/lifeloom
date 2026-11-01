export type MatchableAccount = {
  id: string;
  name?: string;
  match_hints: string | null;
  is_archived: number;
  deleted_at?: string | null;
  created_at?: string;
};

export type BackfillableEntry = {
  id: string;
  source: string;
  raw_input: string | null;
  account_id: string | null;
  deleted_at: string | null;
};

const MAX_HINTS_LEN = 200;

// A 4–6 digit run not touching other digits. Longer runs (UPI refs, full card
// numbers) and shorter ones (dates, small amounts) are never identifiers.
const DIGIT_RUN = /(?<!\d)\d{4,6}(?!\d)/g;

// What must immediately precede a digit run for it to count as a card/account
// identifier rather than an amount, ref or date:
// - a mask run not glued to a word ("XX1234", "x1234", "**1234", "•1234", "...1234")
//   — "max 5872" is NOT a mask because the x belongs to a word;
// - or a card/account keyword ("ending 5872", "ending in", "Card no. 5872", "A/c 1234").
const MASK_BEFORE = /(?:^|[^a-z])(?:[x*•]+|\.{2,})\s*$/;
const KEYWORD_BEFORE =
  /(?:ending(?:\s+(?:in|with))?|card(?:\s*(?:no|number))?|a\/c(?:\s*no)?|acct(?:\s*no)?|account(?:\s*(?:no|number))?)\s*[.:#-]?\s*$/;

/**
 * Card/account identifiers in a bank alert, as their last-4 digits, deduped in
 * first-seen order. Deterministic — never asks a model, so an amount can't be
 * mistaken for a card number.
 */
export function extractAlertIdentifiers(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  for (const m of lower.matchAll(DIGIT_RUN)) {
    const before = lower.slice(Math.max(0, m.index - 24), m.index);
    if (!MASK_BEFORE.test(before) && !KEYWORD_BEFORE.test(before)) continue;
    const last4 = m[0].slice(-4);
    if (!out.includes(last4)) out.push(last4);
  }
  return out;
}

/**
 * An account's matchable tokens. Digit tokens (last-4) come from standalone
 * 4-digit groups in the NAME ("Tata Neo 5872") plus all-digit hints (≥4 digits,
 * reduced to last-4). Every other hint ≥2 chars is a keyword.
 */
export function accountTokens(account: MatchableAccount): { digits: string[]; keywords: string[] } {
  const digits: string[] = [];
  const keywords: string[] = [];
  const addDigits = (d: string) => { if (!digits.includes(d)) digits.push(d); };

  for (const m of (account.name ?? '').matchAll(/(?<!\d)\d{4}(?!\d)/g)) addDigits(m[0]);

  for (const raw of (account.match_hints ?? '').split(/[,\n]/)) {
    const token = raw.trim().toLowerCase();
    if (/^\d+$/.test(token)) {
      if (token.length >= 4) addDigits(token.slice(-4));
    } else if (token.length >= 2 && !keywords.includes(token)) {
      keywords.push(token);
    }
  }
  return { digits, keywords };
}

/**
 * The account an alert belongs to, or null. A card/account-number match (score
 * 2) beats a keyword match (score 1). Only a UNIQUE top scorer wins — a tie
 * returns null so an ambiguous alert is left for the user rather than guessed.
 * Archived and deleted accounts never match.
 */
export function matchAccountFromText(text: string, accounts: MatchableAccount[]): string | null {
  const lower = text.toLowerCase();
  const ids = extractAlertIdentifiers(text);

  let best = 0;
  let winners: string[] = [];
  for (const account of accounts) {
    if (account.is_archived === 1 || account.deleted_at) continue;
    const { digits, keywords } = accountTokens(account);
    const score = digits.some(d => ids.includes(d)) ? 2 : keywords.some(k => lower.includes(k)) ? 1 : 0;
    if (score === 0 || score < best) continue;
    if (score > best) { best = score; winners = [account.id]; }
    else winners.push(account.id);
  }
  return winners.length === 1 ? winners[0] : null;
}

/**
 * `hints` with `last4` appended (", "-separated), or null when there's nothing
 * to write: the digits are already a hint, or appending would exceed the
 * 200-char match_hints limit.
 */
export function addHintDigits(hints: string | null, last4: string): string | null {
  const current = (hints ?? '').trim();
  const tokens = current.split(/[,\n]/).map(t => t.trim());
  if (tokens.includes(last4)) return null;
  const next = current ? `${current}, ${last4}` : last4;
  return next.length > MAX_HINTS_LEN ? null : next;
}

/**
 * Account assignments for past alert-sourced entries (sms/email) that have no
 * account yet, using their stored raw alert text. Never touches an entry that
 * already has an account.
 */
export function planAccountBackfill(
  entries: BackfillableEntry[],
  accounts: MatchableAccount[],
): Array<{ id: string; account_id: string }> {
  const plan: Array<{ id: string; account_id: string }> = [];
  for (const e of entries) {
    if (e.deleted_at || e.account_id || !e.raw_input) continue;
    if (e.source !== 'sms' && e.source !== 'email') continue;
    const accountId = matchAccountFromText(e.raw_input, accounts);
    if (accountId) plan.push({ id: e.id, account_id: accountId });
  }
  return plan;
}
