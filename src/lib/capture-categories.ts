import { categoryId } from '@/lib/category-dedupe'

export type CaptureCategory = { id: string; name: string; kind: string; created_at: string }

// Voice and receipt capture offer the AI the user's live categories by name, then
// map the name it picks back to an id. The server projection can hold several live
// categories with the same name and kind (each device once seeded the defaults
// under its own ids; see migration 0029), and D1 returns rows in no particular
// order, so a plain `find` could tag the same receipt with a different copy from
// one request to the next.
//
// This keeps exactly one category per (kind, name):
//  1. the canonical id `cat-{userId}-{slug}`, which the client-side dedupe
//     (category-dedupe.ts) keeps and remaps every other copy onto;
//  2. otherwise the oldest copy;
//  3. then the smallest id, as a final tie-break.
// The result is sorted by kind, then name, so the AI prompt doesn't change order
// between requests either.
export function captureCategories<T extends CaptureCategory>(rows: T[], userId: string): T[] {
  const best = new Map<string, T>()
  for (const c of rows) {
    const key = `${c.kind}\u0000${c.name}`
    const current = best.get(key)
    if (!current || prefer(c, current, userId)) best.set(key, c)
  }
  return [...best.values()].sort((a, b) => cmp(a.kind, b.kind) || cmp(a.name, b.name))
}

function prefer(a: CaptureCategory, b: CaptureCategory, userId: string): boolean {
  const canonA = a.id === categoryId(userId, a.name)
  const canonB = b.id === categoryId(userId, b.name)
  if (canonA !== canonB) return canonA
  return (cmp(a.created_at, b.created_at) || cmp(a.id, b.id)) < 0
}

// Plain code-unit comparison: deterministic everywhere, unlike localeCompare.
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
