import { compareHlc, parseHlc } from '@/lib/hlc'
import type { Op } from '@/types/ops'

/**
 * Dedup + order: the incoming ops the server does not already have (by id),
 * sorted by HLC. The order matters for materialization: a client's backlog can
 * carry a create and a later update/delete of the same row in one push, and
 * applying the update first fails a NOT NULL constraint on insert (the create
 * then lands as if the update never happened).
 */
export function filterNewOps(incomingOps: Op[], existingIds: Set<string>): Op[] {
  return incomingOps
    .filter(o => !existingIds.has(o.id))
    .sort((a, b) => compareHlc(parseHlc(a.hlc), parseHlc(b.hlc)))
}

/** The ops a client is missing: filter to hlc > cursor (if given), sorted by HLC. */
export function orderOpsAfter(ops: Op[], cursor?: string): Op[] {
  const filtered = cursor
    ? ops.filter(o => compareHlc(parseHlc(o.hlc), parseHlc(cursor)) > 0)
    : ops
  return [...filtered].sort((a, b) => compareHlc(parseHlc(a.hlc), parseHlc(b.hlc)))
}
