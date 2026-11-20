import type { ShareDraftRow } from '@/lib/share-edit'

export type KnownPersonLite = { id: string; name: string }

const norm = (s: string) => s.trim().toLocaleLowerCase()

/**
 * Map the names the money agent heard ("split with Arun and Priya") onto the
 * user's people, case-insensitively. Unknown names come back with a null
 * `person_id` and the chip shows them as "new" — the person is created on
 * confirm, never silently by the agent. Duplicate names collapse to one row
 * (the first amount wins) so "Arun and arun" cannot double a debt.
 */
export function matchPeople(
  heard: { name: string; amount: number | null }[],
  people: KnownPersonLite[],
): ShareDraftRow[] {
  const byName = new Map(people.map(p => [norm(p.name), p]))
  const seen = new Set<string>()
  const rows: ShareDraftRow[] = []
  for (const h of heard) {
    const key = norm(h.name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const person = byName.get(key)
    rows.push({ person_id: person?.id ?? null, name: person?.name ?? h.name.trim(), amount: h.amount })
  }
  return rows
}

/** The one person a settlement names, or null when nobody matches (the UI then asks). */
export function matchPerson(name: string, people: KnownPersonLite[]): KnownPersonLite | null {
  const key = norm(name)
  return people.find(p => norm(p.name) === key) ?? null
}

// ── Who a bank credit is from ────────────────────────────────────────────────
// Bank alerts name the sender their own way ("ARUN KUMAR S", "MR PRIYA RAMAN"),
// so a credit is only ever SUGGESTED as someone's repayment, and the owner
// always confirms it. Confirming remembers the alert's wording on the person
// (`match_names`), so the next credit from them is recognised exactly.

export type MatchablePerson = { id: string; name: string; match_names?: string | null; is_archived?: number; deleted_at?: string | null }

const MAX_MATCH_NAMES = 10
const MAX_MATCH_NAME_LENGTH = 50   // 10 x 50 + JSON quoting stays under the 600-char schema limit
const words = (s: string) => s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean)
const wording = (s: string) => words(s).join(' ')

/** The names stored on a person, tolerating an empty or damaged value. */
export function matchNames(stored: string | null | undefined): string[] {
  if (!stored) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string' && n.trim().length > 0) : []
  } catch {
    return []
  }
}

/** `stored` with `name` added (newest last, at most 10 kept), or null when it's blank or already known. */
export function withMatchName(stored: string | null | undefined, name: string): string | null {
  const key = wording(name)
  if (!key) return null
  const list = matchNames(stored)
  if (list.some(n => wording(n) === key)) return null
  return JSON.stringify([...list, name.trim().slice(0, MAX_MATCH_NAME_LENGTH)].slice(-MAX_MATCH_NAMES))
}

/**
 * The person a credit from `sender` is probably from, or null. A remembered
 * bank name matches first; otherwise every word of exactly one person's name
 * must appear as a whole word in the sender ("Arun" ⊂ "ARUN KUMAR S", but not
 * "ARUNACHALAM"). Two candidates is a tie and suggests nobody.
 */
export function suggestPayer(
  sender: string | null | undefined,
  people: MatchablePerson[],
): { personId: string; via: 'remembered' | 'name' } | null {
  const key = sender ? wording(sender) : ''
  if (!key) return null
  const live = people.filter(p => !p.deleted_at && !p.is_archived)
  const remembered = live.filter(p => matchNames(p.match_names).some(n => wording(n) === key))
  if (remembered.length === 1) return { personId: remembered[0].id, via: 'remembered' }
  if (remembered.length > 1) return null
  const senderWords = new Set(words(sender!))
  const byName = live.filter(p => {
    const nameWords = words(p.name)
    return nameWords.length > 0 && nameWords.every(w => senderWords.has(w))
  })
  return byName.length === 1 ? { personId: byName[0].id, via: 'name' } : null
}
