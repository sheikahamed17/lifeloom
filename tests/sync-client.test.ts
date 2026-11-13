import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp, getDeviceId, pushPullOnce } from '@/lib/sync-client'
import type { Op } from '@/types/ops'

describe('sync-client local pipeline', () => {
  beforeEach(async () => { await resetDb() })

  it('generates a unique device id on first call and reuses it', async () => {
    const id1 = await getDeviceId()
    const id2 = await getDeviceId()
    expect(id1).toBe(id2)
    expect(id1.length).toBeGreaterThanOrEqual(8)
  })

  it('hands concurrent first callers the same device id', async () => {
    const ids = await Promise.all([getDeviceId(), getDeviceId(), getDeviceId()])
    expect(new Set(ids).size).toBe(1)
    expect(await getDeviceId()).toBe(ids[0])
  })

  it('generateOp + applyLocalOp persists both op_log and entity row', async () => {
    const op = await generateOp({
      entity_kind: 'widget',
      entity_id: 'w1',
      op_type: 'create',
      payload: { label: 'first' },
      user_id: 'u1',
    })
    await applyLocalOp(op)

    const ops = await db.op_log.toArray()
    expect(ops).toHaveLength(1)

    const widget = await db.widgets.get('w1')
    expect(widget?.label).toBe('first')
  })

  it('applies the same op twice concurrently without a ConstraintError (two syncs racing)', async () => {
    const op = await generateOp({ entity_kind: 'widget', entity_id: 'w-race', op_type: 'create', payload: { label: 'once' }, user_id: 'u1' })
    await expect(Promise.all([applyLocalOp(op), applyLocalOp(op), applyLocalOp(op)])).resolves.toBeDefined()
    expect(await db.op_log.where('id').equals(op.id).count()).toBe(1)
    expect((await db.widgets.get('w-race'))?.label).toBe('once')
  })

  it('generateOp issues strictly monotonically-increasing HLCs', async () => {
    const a = await generateOp({ entity_kind: 'widget', entity_id: 'w1', op_type: 'create', payload: { label: 'a' }, user_id: 'u1' })
    const b = await generateOp({ entity_kind: 'widget', entity_id: 'w2', op_type: 'create', payload: { label: 'b' }, user_id: 'u1' })
    expect(a.hlc < b.hlc).toBe(true)
  })
})

describe('pushPullOnce', () => {
  beforeEach(async () => { await resetDb() })

  it('sends pending ops and applies returned ops', async () => {
    // Arrange: one local op + one "server" op the server returns
    const localOp = await generateOp({ entity_kind: 'widget', entity_id: 'w1', op_type: 'create', payload: { label: 'local' }, user_id: 'u1' })
    await applyLocalOp(localOp)

    const serverOp = {
      id: 'op-from-server',
      hlc: '0000000000999999-000000-server',
      device_id: 'server',
      user_id: 'u1',
      entity_kind: 'widget' as const,
      entity_id: 'w2',
      op_type: 'create' as const,
      payload: { label: 'server' },
      schema_version: 1,
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      server_hlc: serverOp.hlc,
      new_ops_from_server: [serverOp],
      applied_ack: [localOp.id],
    })))

    // Act
    await pushPullOnce({ userId: 'u1' })

    // Assert
    const widgets = await db.widgets.toArray()
    expect(widgets.map(w => w.id).sort()).toEqual(['w1', 'w2'])

    fetchSpy.mockRestore()
  })
})

describe('applyLocalOp — Phase 1 entity kinds', () => {
  beforeEach(async () => { await resetDb() })

  it('materializes a money_entries row from a money create op', async () => {
    await applyLocalOp({
      id: 'op-m1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'money', entity_id: 'm1',
      op_type: 'create',
      payload: {
        amount: 8000, currency: 'INR', direction: 'out',
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'manual', description: 'chai',
      },
      schema_version: 1,
    })
    const row = await db.money_entries.get('m1')
    expect(row?.amount).toBe(8000)
    expect(row?.description).toBe('chai')
  })

  it('materializes money_entries with merchant and tags', async () => {
    await applyLocalOp({
      id: 'op-m2',
      hlc: '0000000000000002-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'money', entity_id: 'm2',
      op_type: 'create',
      payload: {
        amount: 15000, currency: 'INR', direction: 'out',
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'manual', description: null,
        merchant: 'CRUNCHYROLL',
        tags: ['subscription', 'fun'],
      },
      schema_version: 1,
    })
    const row = await db.money_entries.get('m2')
    expect(row?.amount).toBe(15000)
    expect(row?.merchant).toBe('CRUNCHYROLL')
    expect(row?.tags).toEqual(['subscription', 'fun'])
    expect(Array.isArray(row?.tags)).toBe(true)
  })

  it('stores money tags as a native array, not stringified', async () => {
    await applyLocalOp({
      id: 'op-m-tags-array',
      hlc: '0000000000000003-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'money', entity_id: 'm-tags',
      op_type: 'create',
      payload: {
        amount: 5000, currency: 'INR', direction: 'out',
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'sms',
        merchant: 'UBER',
        tags: ['travel', 'work'],
      },
      schema_version: 1,
    })
    const row = await db.money_entries.get('m-tags')
    expect(Array.isArray(row?.tags)).toBe(true)
    expect(row?.tags).toEqual(['travel', 'work'])
  })

  it('updates money entry via update op (LWW merge with tags)', async () => {
    await applyLocalOp({
      id: 'op-m-create',
      hlc: '0000000000000004-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'money', entity_id: 'm-update',
      op_type: 'create',
      payload: {
        amount: 1000, currency: 'INR', direction: 'out',
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'manual',
        merchant: 'OLD_MERCHANT',
        tags: ['old'],
      },
      schema_version: 1,
    })
    await applyLocalOp({
      id: 'op-m-update',
      hlc: '0000000000000005-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'money', entity_id: 'm-update',
      op_type: 'update',
      payload: {
        tags: ['new', 'updated'],
      },
      schema_version: 1,
    })
    const row = await db.money_entries.get('m-update')
    expect(row?.merchant).toBe('OLD_MERCHANT')
    expect(row?.tags).toEqual(['new', 'updated'])
  })

  it('materializes a category create op', async () => {
    await applyLocalOp({
      id: 'op-c1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'category', entity_id: 'c1',
      op_type: 'create',
      payload: { name: 'Food', kind: 'spend', sort_order: 0, icon: '🍴' },
      schema_version: 1,
    })
    const row = await db.categories.get('c1')
    expect(row?.name).toBe('Food')
    expect(row?.kind).toBe('spend')
  })

  it('materializes a recurring create op', async () => {
    await applyLocalOp({
      id: 'op-r1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'recurring', entity_id: 'r1',
      op_type: 'create',
      payload: {
        amount: 2500000, currency: 'INR', direction: 'out',
        period: 'monthly', interval_count: 1,
        anchor_at: '2026-06-01T00:00:00Z',
        next_due_at: '2026-07-01T00:00:00Z',
        end_condition_kind: 'never',
        is_active: 1,
      },
      schema_version: 1,
    })
    const row = await db.recurring_rules.get('r1')
    expect(row?.period).toBe('monthly')
    expect(row?.next_due_at).toBe('2026-07-01T00:00:00Z')
  })

  it('is idempotent per op.id across all entity kinds', async () => {
    const op = {
      id: 'op-dup',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'money' as const, entity_id: 'mDup',
      op_type: 'create' as const,
      payload: {
        amount: 100, currency: 'INR', direction: 'out' as const,
        occurred_at: '2026-06-18T14:30:00Z', source: 'manual' as const,
      },
      schema_version: 1,
    }
    await applyLocalOp(op)
    await applyLocalOp(op)
    expect(await db.op_log.count()).toBe(1)
    expect(await db.money_entries.count()).toBe(1)
  })
})

describe('applyLocalOp — Phase 2 task entity', () => {
  beforeEach(async () => { await resetDb() })

  it('materializes a tasks row from a task create op', async () => {
    await applyLocalOp({
      id: 'op-t1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'task', entity_id: 't1',
      op_type: 'create',
      payload: {
        title: 'call mom',
        due_at: '2026-06-19T15:00:00.000Z',
        priority: 'medium',
        source: 'voice',
      },
      schema_version: 1,
    })
    const row = await db.tasks.get('t1')
    expect(row?.title).toBe('call mom')
    expect(row?.priority).toBe('medium')
    expect(row?.due_at).toBe('2026-06-19T15:00:00.000Z')
  })

  it('toggles completed_at via update op', async () => {
    // Create then complete
    await applyLocalOp({
      id: 'op-t2-create',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'task', entity_id: 't2',
      op_type: 'create',
      payload: { title: 'file taxes', priority: 'high', source: 'manual' },
      schema_version: 1,
    })
    await applyLocalOp({
      id: 'op-t2-complete',
      hlc: '0000000000000002-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'task', entity_id: 't2',
      op_type: 'update',
      payload: { completed_at: '2026-06-19T15:00:00.000Z' },
      schema_version: 1,
    })
    const row = await db.tasks.get('t2')
    expect(row?.completed_at).toBe('2026-06-19T15:00:00.000Z')
    expect(row?.title).toBe('file taxes')               // preserved across update
  })

  it('un-completes via update with completed_at: null', async () => {
    await applyLocalOp({
      id: 'op-t3-create',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'task', entity_id: 't3',
      op_type: 'create',
      payload: { title: 'x', completed_at: '2026-06-19T00:00:00.000Z', source: 'manual' },
      schema_version: 1,
    })
    await applyLocalOp({
      id: 'op-t3-uncomplete',
      hlc: '0000000000000002-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'task', entity_id: 't3',
      op_type: 'update',
      payload: { completed_at: null },
      schema_version: 1,
    })
    const row = await db.tasks.get('t3')
    expect(row?.completed_at).toBeNull()
  })

  it('is idempotent on duplicate task op.id', async () => {
    const op = {
      id: 'op-t-dup',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'task' as const, entity_id: 'tDup',
      op_type: 'create' as const,
      payload: { title: 'one', source: 'manual' as const },
      schema_version: 1,
    }
    await applyLocalOp(op)
    await applyLocalOp(op)
    expect(await db.op_log.count()).toBe(1)
    expect(await db.tasks.count()).toBe(1)
  })
})

describe('applyLocalOp: insight', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('creates a new insight row from op', async () => {
    const userId = 'user-1'
    const op: Op = {
      id: 'op-insight-1',
      hlc: '1234567890-000000-dev',
      device_id: 'dev',
      user_id: userId,
      entity_kind: 'insight',
      entity_id: 'insight-1',
      op_type: 'create',
      payload: {
        period: 'weekly',
        starts_at: '2026-06-21T18:30:00.000Z',
        ends_at: '2026-06-28T18:30:00.000Z',
        summary: 'Great week!',
        metrics: JSON.stringify({ spend_total: 5000 }),
      },
      schema_version: 1,
    }
    await applyLocalOp(op)
    const row = await db.insights.get('insight-1')
    expect(row?.summary).toBe('Great week!')
    expect(row?.user_id).toBe(userId)
  })

  it('updates existing insight (LWW merge)', async () => {
    const userId = 'user-1'
    const op1: Op = {
      id: 'op-1',
      hlc: '1000-000000-dev',
      device_id: 'dev',
      user_id: userId,
      entity_kind: 'insight',
      entity_id: 'insight-1',
      op_type: 'create',
      payload: {
        period: 'weekly',
        starts_at: '2026-06-21T18:30:00.000Z',
        ends_at: '2026-06-28T18:30:00.000Z',
        summary: 'Old summary',
        metrics: '{}',
      },
      schema_version: 1,
    }
    await applyLocalOp(op1)
    const op2: Op = {
      id: 'op-2',
      hlc: '2000-000000-dev',
      device_id: 'dev',
      user_id: userId,
      entity_kind: 'insight',
      entity_id: 'insight-1',
      op_type: 'update',
      payload: {
        summary: 'Updated summary',
      },
      schema_version: 1,
    }
    await applyLocalOp(op2)
    const row = await db.insights.get('insight-1')
    expect(row?.summary).toBe('Updated summary')
  })

  it('idempotent: duplicate op has no effect', async () => {
    const userId = 'user-1'
    const op: Op = {
      id: 'op-dup',
      hlc: '1000-000000-dev',
      device_id: 'dev',
      user_id: userId,
      entity_kind: 'insight',
      entity_id: 'insight-1',
      op_type: 'create',
      payload: {
        period: 'weekly',
        starts_at: '2026-06-21T18:30:00.000Z',
        ends_at: '2026-06-28T18:30:00.000Z',
        summary: 'First',
        metrics: '{}',
      },
      schema_version: 1,
    }
    await applyLocalOp(op)
    const before = await db.op_log.count()
    await applyLocalOp(op)
    const after = await db.op_log.count()
    expect(before).toBe(after)
  })
})

describe('applyLocalOp — learning entity', () => {
  beforeEach(async () => { await resetDb() })

  it('materializes a learning_entries row from a learning create op', async () => {
    await applyLocalOp({
      id: 'op-l1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'learning', entity_id: 'l1',
      op_type: 'create',
      payload: {
        text: 'TypeScript generics are powerful',
        tags: ['ts', 'generics'],
        attribution: 'Sheik',
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'manual',
      },
      schema_version: 1,
    })
    const row = await db.learning_entries.get('l1')
    expect(row?.text).toBe('TypeScript generics are powerful')
    expect(row?.tags).toEqual(['ts', 'generics'])
    expect(row?.attribution).toBe('Sheik')
    expect(row?.source).toBe('manual')
    expect(row?.deleted_at).toBeNull()
  })

  it('stores tags as a native array, not stringified', async () => {
    await applyLocalOp({
      id: 'op-l-array-test',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'learning', entity_id: 'l-array',
      op_type: 'create',
      payload: {
        text: 'Array test',
        tags: ['one', 'two', 'three'],
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'voice',
      },
      schema_version: 1,
    })
    const row = await db.learning_entries.get('l-array')
    expect(Array.isArray(row?.tags)).toBe(true)
    expect(row?.tags).toEqual(['one', 'two', 'three'])
  })

  it('updates a learning entry via update op (LWW merge)', async () => {
    await applyLocalOp({
      id: 'op-l-create',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'learning', entity_id: 'l-update',
      op_type: 'create',
      payload: {
        text: 'Original text',
        tags: ['old'],
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'manual',
      },
      schema_version: 1,
    })
    await applyLocalOp({
      id: 'op-l-update',
      hlc: '0000000000000002-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'learning', entity_id: 'l-update',
      op_type: 'update',
      payload: {
        tags: ['new', 'updated'],
      },
      schema_version: 1,
    })
    const row = await db.learning_entries.get('l-update')
    expect(row?.text).toBe('Original text')
    expect(row?.tags).toEqual(['new', 'updated'])
  })

  it('tombstones via delete op (sets deleted_at)', async () => {
    await applyLocalOp({
      id: 'op-l-create-del',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'learning', entity_id: 'l-delete',
      op_type: 'create',
      payload: {
        text: 'Will be deleted',
        tags: [],
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'manual',
      },
      schema_version: 1,
    })
    await applyLocalOp({
      id: 'op-l-delete',
      hlc: '0000000000000002-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'learning', entity_id: 'l-delete',
      op_type: 'delete',
      payload: {},
      schema_version: 1,
    })
    const row = await db.learning_entries.get('l-delete')
    expect(row?.deleted_at).not.toBeNull()
  })

  it('is idempotent on duplicate learning op.id', async () => {
    const op = {
      id: 'op-l-dup',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'learning' as const, entity_id: 'l-dup',
      op_type: 'create' as const,
      payload: {
        text: 'idempotent test',
        tags: [],
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'manual' as const,
      },
      schema_version: 1,
    }
    await applyLocalOp(op)
    await applyLocalOp(op)
    expect(await db.op_log.count()).toBe(1)
    expect(await db.learning_entries.count()).toBe(1)
  })
})

describe('applyLocalOp — note entity', () => {
  beforeEach(async () => { await resetDb() })

  it('materializes a note_entries row from a note create op', async () => {
    await applyLocalOp({
      id: 'op-n1',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'note', entity_id: 'n1',
      op_type: 'create',
      payload: {
        title: 'WiFi Setup',
        body: 'WiFi password is hunter2',
        tags: ['home', 'network'],
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'voice',
      },
      schema_version: 1,
    })
    const row = await db.note_entries.get('n1')
    expect(row?.title).toBe('WiFi Setup')
    expect(row?.body).toBe('WiFi password is hunter2')
    expect(row?.tags).toEqual(['home', 'network'])
    expect(row?.source).toBe('voice')
    expect(row?.deleted_at).toBeNull()
  })

  it('stores tags as a native array, not stringified', async () => {
    await applyLocalOp({
      id: 'op-n-array-test',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'note', entity_id: 'n-array',
      op_type: 'create',
      payload: {
        title: null,
        body: 'Array test note',
        tags: ['tag1', 'tag2', 'tag3'],
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'manual',
      },
      schema_version: 1,
    })
    const row = await db.note_entries.get('n-array')
    expect(Array.isArray(row?.tags)).toBe(true)
    expect(row?.tags).toEqual(['tag1', 'tag2', 'tag3'])
  })

  it('updates a note entry via update op (LWW merge)', async () => {
    await applyLocalOp({
      id: 'op-n-create',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'note', entity_id: 'n-update',
      op_type: 'create',
      payload: {
        title: 'Original title',
        body: 'Original body text',
        tags: ['old'],
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'manual',
      },
      schema_version: 1,
    })
    await applyLocalOp({
      id: 'op-n-update',
      hlc: '0000000000000002-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'note', entity_id: 'n-update',
      op_type: 'update',
      payload: {
        tags: ['new', 'updated'],
      },
      schema_version: 1,
    })
    const row = await db.note_entries.get('n-update')
    expect(row?.title).toBe('Original title')
    expect(row?.body).toBe('Original body text')
    expect(row?.tags).toEqual(['new', 'updated'])
  })

  it('tombstones via delete op (sets deleted_at)', async () => {
    await applyLocalOp({
      id: 'op-n-create-del',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'note', entity_id: 'n-delete',
      op_type: 'create',
      payload: {
        title: 'Will be deleted',
        body: 'This note will be deleted',
        tags: [],
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'manual',
      },
      schema_version: 1,
    })
    await applyLocalOp({
      id: 'op-n-delete',
      hlc: '0000000000000002-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'note', entity_id: 'n-delete',
      op_type: 'delete',
      payload: {},
      schema_version: 1,
    })
    const row = await db.note_entries.get('n-delete')
    expect(row?.deleted_at).not.toBeNull()
  })

  it('is idempotent on duplicate note op.id', async () => {
    const op = {
      id: 'op-n-dup',
      hlc: '0000000000000001-000000-d1',
      device_id: 'd1', user_id: 'u1',
      entity_kind: 'note' as const, entity_id: 'n-dup',
      op_type: 'create' as const,
      payload: {
        title: 'Idempotent note',
        body: 'This is a test note',
        tags: [],
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'manual' as const,
      },
      schema_version: 1,
    }
    await applyLocalOp(op)
    await applyLocalOp(op)
    expect(await db.op_log.count()).toBe(1)
    expect(await db.note_entries.count()).toBe(1)
  })
})

describe('applyLocalOp — budget entity', () => {
  beforeEach(async () => { await resetDb() })

  it('applyLocalOp materializes a budget to Dexie (client step)', async () => {
    const op = await generateOp({
      entity_kind: 'budget', entity_id: 'cat-food',
      op_type: 'create',
      payload: { category_id: 'cat-food', amount: 800000, currency: 'INR' },
      user_id: 'u1',
    })
    await applyLocalOp(op)
    const row = await db.budgets.get('cat-food')
    expect(row).toBeTruthy()
    expect(row!.amount).toBe(800000)
    expect(row!.category_id).toBe('cat-food')
    expect(row!.currency).toBe('INR')
  })
})

describe('applyLocalOp — account entity', () => {
  beforeEach(async () => { await resetDb() })

  it('applyLocalOp materializes an account to Dexie (client step)', async () => {
    const op = await generateOp({
      entity_kind: 'account', entity_id: 'cash-1',
      op_type: 'create',
      payload: { name: 'Cash', type: 'asset', opening_balance: 500000, currency: 'INR', icon: '💰', is_archived: 0 },
      user_id: 'u1',
    })
    await applyLocalOp(op)
    const row = await db.accounts.get('cash-1')
    expect(row).toBeTruthy()
    expect(row!.name).toBe('Cash')
    expect(row!.type).toBe('asset')
    expect(row!.opening_balance).toBe(500000)
    expect(row!.currency).toBe('INR')
    expect(row!.icon).toBe('💰')
    expect(row!.is_archived).toBe(0)
  })

  it('account update op (per-field LWW) leaves other fields unchanged', async () => {
    // Create account
    const createOp = await generateOp({
      entity_kind: 'account', entity_id: 'card-1',
      op_type: 'create',
      payload: { name: 'Credit Card', type: 'liability', opening_balance: 200000, currency: 'INR' },
      user_id: 'u1',
    })
    await applyLocalOp(createOp)

    // Update only the name
    const updateOp = await generateOp({
      entity_kind: 'account', entity_id: 'card-1',
      op_type: 'update',
      payload: { name: 'AMEX Card' },
      user_id: 'u1',
    })
    await applyLocalOp(updateOp)

    const row = await db.accounts.get('card-1')
    expect(row!.name).toBe('AMEX Card')
    expect(row!.opening_balance).toBe(200000)  // unchanged
    expect(row!.type).toBe('liability')         // unchanged
  })
})

describe('applyLocalOp — money with account_id', () => {
  beforeEach(async () => { await resetDb() })

  it('money op with account_id rounds trips to Dexie', async () => {
    const op = await generateOp({
      entity_kind: 'money', entity_id: 'm-with-acct',
      op_type: 'create',
      payload: {
        amount: 10000, currency: 'INR', direction: 'out',
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'manual', description: 'lunch',
        account_id: 'cash-1',
      },
      user_id: 'u1',
    })
    await applyLocalOp(op)
    const row = await db.money_entries.get('m-with-acct')
    expect(row?.account_id).toBe('cash-1')
    expect(row?.amount).toBe(10000)
  })

  it('legacy money row with no account_id is handled correctly', async () => {
    const op = await generateOp({
      entity_kind: 'money', entity_id: 'm-legacy',
      op_type: 'create',
      payload: {
        amount: 5000, currency: 'INR', direction: 'in',
        occurred_at: '2026-06-18T14:30:00Z',
        source: 'manual',
      },
      user_id: 'u1',
    })
    await applyLocalOp(op)
    const row = await db.money_entries.get('m-legacy')
    expect(row?.account_id).toBeUndefined()
  })
})
