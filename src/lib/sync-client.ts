import { db } from '@/lib/dexie'
import { applyOp } from '@/lib/op-log'
import { createHlc, parseHlc, serializeHlc, tickHlc } from '@/lib/hlc'
import type { Op } from '@/types/ops'

function newDeviceId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

const SCHEMA_VERSION = 1

export async function getDeviceId(): Promise<string> {
  const row = await db.sync_meta.get('device_id')
  if (row) return row.value
  const id = newDeviceId()
  await db.sync_meta.put({ key: 'device_id', value: id })
  return id
}

async function readLocalHlc(deviceId: string) {
  const row = await db.sync_meta.get('local_hlc')
  if (row) return parseHlc(row.value)
  return createHlc(deviceId, Date.now())
}

async function writeLocalHlc(hlcStr: string) {
  await db.sync_meta.put({ key: 'local_hlc', value: hlcStr })
}

export async function generateOp(input: {
  entity_kind: Op['entity_kind']
  entity_id: string
  op_type: Op['op_type']
  payload: Record<string, unknown>
  user_id: string
}): Promise<Op> {
  const deviceId = await getDeviceId()
  const prev = await readLocalHlc(deviceId)
  const next = tickHlc(prev, Date.now())
  await writeLocalHlc(serializeHlc(next))

  return {
    id: crypto.randomUUID(),
    hlc: serializeHlc(next),
    device_id: deviceId,
    user_id: input.user_id,
    entity_kind: input.entity_kind,
    entity_id: input.entity_id,
    op_type: input.op_type,
    payload: input.payload,
    schema_version: SCHEMA_VERSION,
  }
}

export async function applyLocalOp(op: Op): Promise<void> {
  const existing = await db.op_log.get(op.id)
  if (existing) return

  await db.transaction(
    'rw',
    [db.op_log, db.widgets, db.money_entries, db.recurring_rules, db.categories, db.tasks, db.insights, db.learning_entries, db.note_entries, db.budgets, db.accounts, db.goals, db.transfers, db.habits, db.habit_logs, db.journal_entries, db.projects, db.people, db.expense_shares],
    async () => {
      await db.op_log.add(op)

      switch (op.entity_kind) {
        case 'widget': {
          const current = await db.widgets.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.widgets.put(next as never)
          return
        }
        case 'money': {
          const current = await db.money_entries.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.money_entries.put(next as never)
          return
        }
        case 'recurring': {
          const current = await db.recurring_rules.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.recurring_rules.put(next as never)
          return
        }
        case 'category': {
          const current = await db.categories.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.categories.put(next as never)
          return
        }
        case 'task': {
          const current = await db.tasks.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.tasks.put(next as never)
          return
        }
        case 'insight': {
          const current = await db.insights.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.insights.put(next as never)
          return
        }
        case 'learning': {
          const current = await db.learning_entries.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.learning_entries.put(next as never)
          return
        }
        case 'note': {
          const current = await db.note_entries.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.note_entries.put(next as never)
          return
        }
        case 'budget': {
          const current = await db.budgets.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.budgets.put(next as never)
          return
        }
        case 'account': {
          const current = await db.accounts.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.accounts.put(next as never)
          return
        }
        case 'goal': {
          const current = await db.goals.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.goals.put(next as never)
          return
        }
        case 'transfer': {
          const current = await db.transfers.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.transfers.put(next as never)
          return
        }
        case 'project': {
          const current = await db.projects.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.projects.put(next as never)
          return
        }
        case 'habit': {
          const current = await db.habits.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.habits.put(next as never)
          return
        }
        case 'habit_log': {
          const current = await db.habit_logs.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.habit_logs.put(next as never)
          return
        }
        case 'journal': {
          const current = await db.journal_entries.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.journal_entries.put(next as never)
          return
        }
        case 'person': {
          const current = await db.people.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.people.put(next as never)
          return
        }
        case 'expense_share': {
          const current = await db.expense_shares.get(op.entity_id)
          const next = applyOp(current as never, op)
          await db.expense_shares.put(next as never)
          return
        }
      }
    },
  )
}

export async function getPendingOps(): Promise<Op[]> {
  // For Phase 0, "pending" = every op generated since last server ack
  const synced = (await db.sync_meta.get('synced_op_ids'))?.value ?? ''
  const syncedSet = new Set(synced.split(',').filter(Boolean))
  // HLC order, so the server (and any device) sees a create before its update.
  const all = await db.op_log.orderBy('hlc').toArray()
  return all.filter(o => !syncedSet.has(o.id))
}

async function markSynced(opIds: string[]) {
  const existing = (await db.sync_meta.get('synced_op_ids'))?.value ?? ''
  const combined = new Set(existing.split(',').filter(Boolean))
  for (const id of opIds) combined.add(id)
  await db.sync_meta.put({ key: 'synced_op_ids', value: [...combined].join(',') })
}

async function readLastSyncedHlc(): Promise<string | undefined> {
  return (await db.sync_meta.get('last_synced_hlc'))?.value
}

async function writeLastSyncedHlc(hlc: string) {
  await db.sync_meta.put({ key: 'last_synced_hlc', value: hlc })
}

export async function pushPullOnce(_input: { userId: string }): Promise<{ applied: number; received: number }> {
  const deviceId = await getDeviceId()
  const pending = await getPendingOps()
  const lastSyncedHlc = await readLastSyncedHlc()

  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: deviceId,
      last_synced_hlc: lastSyncedHlc,
      new_ops: pending,
    }),
  })

  if (!res.ok) {
    throw new Error(`sync failed: ${res.status} ${await res.text()}`)
  }

  const body = await res.json() as {
    server_hlc: string
    new_ops_from_server: Op[]
    applied_ack: string[]
  }

  // Apply server ops locally
  for (const op of body.new_ops_from_server) {
    await applyLocalOp(op)
  }

  await markSynced(body.applied_ack)
  await writeLastSyncedHlc(body.server_hlc)

  return { applied: body.applied_ack.length, received: body.new_ops_from_server.length }
}
