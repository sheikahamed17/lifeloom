import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { decodeStoredTags } from './stored-tags'

describe('decodeStoredTags', () => {
  it('decodes a normal JSON-encoded tag column', () => {
    expect(decodeStoredTags('["food","travel"]')).toEqual(['food', 'travel'])
  })

  it('passes an already-decoded array through', () => {
    expect(decodeStoredTags(['food'])).toEqual(['food'])
  })

  it('unwraps a double- and triple-encoded column (the materialize bug)', () => {
    const once = JSON.stringify(['food'])
    expect(decodeStoredTags(JSON.stringify(once))).toEqual(['food'])
    expect(decodeStoredTags(JSON.stringify(JSON.stringify(once)))).toEqual(['food'])
  })

  it('returns [] for null, empty, malformed or non-array values', () => {
    for (const v of [null, undefined, '', 'not json', '{"a":1}', '42', 42, {}]) {
      expect(decodeStoredTags(v)).toEqual([])
    }
  })

  it('keeps only string tags', () => {
    expect(decodeStoredTags('["a",1,null,"b"]')).toEqual(['a', 'b'])
  })

  // Each layer doubles the backslashes, so size grows ~2^depth — 10 layers is
  // already far deeper than D1 would let a row get.
  it('recovers the original tags from any realistic encoding depth (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), fc.integer({ min: 1, max: 10 }), (tags, depth) => {
        let v: string = JSON.stringify(tags)
        for (let i = 1; i < depth; i++) v = JSON.stringify(v)
        expect(decodeStoredTags(v)).toEqual(tags)
      }),
    )
  })
})
