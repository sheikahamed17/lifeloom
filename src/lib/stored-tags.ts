// Guards against a pathological value that never stops decoding to a string.
const MAX_DEPTH = 64

/**
 * The tag list stored in a D1 `tags` column (JSON text), as `string[]`.
 *
 * Unwraps any number of extra JSON-string layers: before the materialize fix,
 * every partial update re-stringified the already-encoded column, so rows in D1
 * can hold `"[\"food\"]"` (or deeper) instead of `["food"]`. Malformed or
 * non-array values decode to `[]`; non-string elements are dropped.
 */
export function decodeStoredTags(value: unknown): string[] {
  let v = value
  for (let i = 0; i < MAX_DEPTH && typeof v === 'string'; i++) {
    try { v = JSON.parse(v) } catch { return [] }
  }
  return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : []
}
