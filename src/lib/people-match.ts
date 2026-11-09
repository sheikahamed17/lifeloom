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
