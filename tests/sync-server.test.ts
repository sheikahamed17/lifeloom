import { describe, it, expect } from 'vitest'
import { filterNewOps, orderOpsAfter } from '@/lib/sync-server'
import { compareHlc, parseHlc } from '@/lib/hlc'
import type { Op } from '@/types/ops'

const mkOp = (id: string, hlc: string, payload: Record<string, unknown>): Op => ({
  id, hlc,
  device_id: 'd1', user_id: 'u1',
  entity_kind: 'widget', entity_id: 'w1',
  op_type: 'update',
  payload,
  schema_version: 1,
})

describe('filterNewOps', () => {
  it('keeps only ops whose id is not in existingIds', () => {
    const incoming = [mkOp('a', '0000000000000001-000000-d1', {}), mkOp('b', '0000000000000002-000000-d1', {})]
    const out = filterNewOps(incoming, new Set(['a']))
    expect(out.map(o => o.id)).toEqual(['b'])
  })
  it('orders the kept ops by HLC so a create is applied before its update or delete', () => {
    const create = { ...mkOp('c', '0000000000000001-000000-d1', {}), op_type: 'create' as const }
    const update = { ...mkOp('u', '0000000000000002-000000-d1', {}), op_type: 'update' as const }
    const del = { ...mkOp('d', '0000000000000003-000000-d1', {}), op_type: 'delete' as const }
    expect(filterNewOps([del, update, create], new Set()).map(o => o.id)).toEqual(['c', 'u', 'd'])
  })

  it('returns all when existingIds is empty', () => {
    const incoming = [mkOp('a', '0000000000000001-000000-d1', {})]
    expect(filterNewOps(incoming, new Set())).toHaveLength(1)
  })
})

describe('orderOpsAfter', () => {
  it('sorts by HLC ascending', () => {
    const ops = [mkOp('a', '0000000000000003-000000-d1', {}), mkOp('b', '0000000000000001-000000-d1', {}), mkOp('c', '0000000000000002-000000-d1', {})]
    expect(orderOpsAfter(ops).map(o => o.id)).toEqual(['b', 'c', 'a'])
  })
  it('filters to hlc > cursor when given', () => {
    const ops = [mkOp('a', '0000000000000001-000000-d1', {}), mkOp('b', '0000000000000003-000000-d1', {})]
    expect(orderOpsAfter(ops, '0000000000000002-000000-d1').map(o => o.id)).toEqual(['b'])
  })
})

describe('hlc string order == compareHlc order (invariant)', () => {
  it('lexicographic string comparison agrees with compareHlc across timestamp/counter/node', () => {
    const hlcs = [
      '0000000000000001-000000-d1',
      '0000000000000001-000001-d1',
      '0000000000000001-000001-d2',
      '0000000000000002-000000-d1',
      '0000000000000010-000000-aa',
    ]
    for (let i = 0; i < hlcs.length; i++) {
      for (let j = 0; j < hlcs.length; j++) {
        const strCmp = hlcs[i] < hlcs[j] ? -1 : hlcs[i] > hlcs[j] ? 1 : 0
        const hlcCmp = Math.sign(compareHlc(parseHlc(hlcs[i]), parseHlc(hlcs[j])))
        expect(hlcCmp).toBe(strCmp)
      }
    }
  })
})
