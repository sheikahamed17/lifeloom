'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ChevronDown, Merge, Pencil } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { useCategories } from '@/hooks/use-categories'
import { useArchivedCategories } from '@/hooks/use-archived-categories'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { planCategoryMerge } from '@/lib/category-merge'
import { db } from '@/lib/dexie'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageShell } from '@/components/page-shell'
import { RowMenu } from '@/components/row-menu'
import { FIELD_SELECT } from '@/components/sort-control'
import { UndoProvider, useUndo } from '@/components/undo-provider'
import type { CategoryRow } from '@/lib/dexie'

const BACK = { href: '/settings', label: 'Settings' }

export default function CategoriesPage() {
  return (
    <UndoProvider>
      <CategoriesPageInner />
    </UndoProvider>
  )
}

function CategoriesPageInner() {
  const router = useRouter()
  const undo = useUndo()
  const [userId, setUserId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [kind, setKind] = useState<'spend' | 'income'>('spend')
  const [mergingId, setMergingId] = useState<string | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null)
  const [isMerging, setIsMerging] = useState(false)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  const categories = useCategories(userId ?? undefined)
  const spend  = categories.filter(c => c.kind === 'spend')
  const income = categories.filter(c => c.kind === 'income')
  const archived = useArchivedCategories(userId ?? undefined)

  async function doMerge(sourceId: string, targetId: string) {
    if (!userId) return
    setIsMerging(true)
    try {
      const [m, r, b] = await Promise.all([
        db.money_entries.where('user_id').equals(userId).toArray(),
        db.recurring_rules.where('user_id').equals(userId).toArray(),
        db.budgets.where('user_id').equals(userId).toArray(),
      ])
      const data = {
        money: m.filter(x => !x.deleted_at),
        recurring: r.filter(x => !x.deleted_at),
        budgets: b.filter(x => !x.deleted_at),
      }
      const ops = planCategoryMerge(sourceId, targetId, data)
      const movedCount = ops.filter(o => o.entity_kind === 'money' || o.entity_kind === 'recurring').length
      for (const op of ops) {
        await applyLocalOp(await generateOp({ entity_kind: op.entity_kind, entity_id: op.entity_id, op_type: op.op_type, payload: op.payload, user_id: userId }))
      }
      const targetCategory = categories.find(c => c.id === targetId)
      undo.push(`Merged into ${targetCategory?.name ?? 'the other category'}: moved ${movedCount} ${movedCount === 1 ? 'entry' : 'entries'}`)
      setMergingId(null)
      setMergeTargetId(null)
      pushPullOnce({ userId }).catch(err => console.error('sync', err))
    } catch (err) {
      console.error('merge', err)
      undo.push('Couldn’t merge those categories. Please try again.')
    } finally {
      setIsMerging(false)
    }
  }

  async function addCategory() {
    if (!userId || !newName.trim()) return
    const sortOrder = (kind === 'spend' ? spend.length : income.length)
    const op = await generateOp({
      entity_kind: 'category',
      entity_id: crypto.randomUUID(),
      op_type: 'create',
      payload: { name: newName.trim(), kind, sort_order: sortOrder, icon: newIcon.trim() || null },
      user_id: userId,
    })
    await applyLocalOp(op)
    setNewName('')
    setNewIcon('')
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function updateCategory(id: string, payload: Record<string, string | number | null>) {
    if (!userId) return
    const op = await generateOp({
      entity_kind: 'category',
      entity_id: id,
      op_type: 'update',
      payload,
      user_id: userId,
    })
    await applyLocalOp(op)
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
  }

  async function archiveCategory(id: string) {
    const name = categories.find(c => c.id === id)?.name
    await updateCategory(id, { is_archived: 1 })
    undo.push(`Archived ${name ?? 'category'}`, () => restoreCategory(id))
  }

  async function restoreCategory(id: string) {
    await updateCategory(id, { is_archived: 0 })
  }

  if (!userId) {
    return (
      <PageShell title="Categories" back={BACK}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PageShell>
    )
  }

  return (
    <PageShell title="Categories" back={BACK}>
      <section className="glass flex flex-col gap-3 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Add a category</h2>
        <div className="flex gap-2">
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name" maxLength={40} aria-label="Category name" />
          <Input value={newIcon} onChange={e => setNewIcon(e.target.value)} placeholder="Emoji" maxLength={8} className="w-20 text-center" aria-label="Category emoji" />
        </div>
        <div className="flex gap-2">
          <select
            value={kind}
            onChange={e => setKind(e.target.value as 'spend' | 'income')}
            className={cn(FIELD_SELECT, 'w-auto')}
            aria-label="Spend or income"
          >
            <option value="spend">Spend</option>
            <option value="income">Income</option>
          </select>
          <Button size="lg" onClick={addCategory} className="flex-1">Add</Button>
        </div>
      </section>

      <CategorySection
        title="Spend"
        categories={spend}
        allCategories={categories}
        onArchive={archiveCategory}
        onUpdate={updateCategory}
        mergingId={mergingId}
        mergeTargetId={mergeTargetId}
        onMergeChange={setMergingId}
        onMergeTargetChange={setMergeTargetId}
        onMergeConfirm={doMerge}
        isMerging={isMerging}
      />
      <CategorySection
        title="Income"
        categories={income}
        allCategories={categories}
        onArchive={archiveCategory}
        onUpdate={updateCategory}
        mergingId={mergingId}
        mergeTargetId={mergeTargetId}
        onMergeChange={setMergingId}
        onMergeTargetChange={setMergeTargetId}
        onMergeConfirm={doMerge}
        isMerging={isMerging}
      />

      {archived.length > 0 && (
        <ArchivedSection archived={archived} onRestore={restoreCategory} />
      )}
    </PageShell>
  )
}

function CategorySection({
  title,
  categories,
  allCategories,
  onArchive,
  onUpdate,
  mergingId,
  mergeTargetId,
  onMergeChange,
  onMergeTargetChange,
  onMergeConfirm,
  isMerging,
}: {
  title: string
  categories: ReturnType<typeof useCategories>
  allCategories: ReturnType<typeof useCategories>
  onArchive: (id: string) => void
  onUpdate: (id: string, payload: Record<string, string | number | null>) => void
  mergingId: string | null
  mergeTargetId: string | null
  onMergeChange: (id: string | null) => void
  onMergeTargetChange: (id: string | null) => void
  onMergeConfirm: (sourceId: string, targetId: string) => void
  isMerging: boolean
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)

  function startEdit(c: CategoryRow) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditIcon(c.icon ?? '')
    onMergeChange(null)
  }

  async function saveEdit(id: string) {
    const trimmed = editName.trim()
    if (!trimmed) return
    await onUpdate(id, { name: trimmed, icon: editIcon.trim() || null })
    setEditingId(null)
  }

  function startMerge(c: CategoryRow) {
    onMergeChange(c.id)
    onMergeTargetChange(null)
    setEditingId(null)
  }

  return (
    <section className="glass flex flex-col gap-2 rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <ul className="glass-soft divide-y divide-white/10 rounded-lg">
        {categories.length === 0 && <li className="p-3 text-sm text-muted-foreground">No {title.toLowerCase()} categories.</li>}
        {categories.map(c => {
          const sameKindActive = allCategories.filter(cat => cat.kind === c.kind)
          const canMerge = sameKindActive.length >= 2
          if (editingId === c.id) {
            return (
              <li key={c.id} className="flex flex-col gap-2 p-3">
                <div className="flex w-full gap-2">
                  <Input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Name"
                    maxLength={40}
                    autoFocus
                    className="flex-1"
                    aria-label={`New name for ${c.name}`}
                  />
                  <Input
                    value={editIcon}
                    onChange={e => setEditIcon(e.target.value)}
                    placeholder="Emoji"
                    maxLength={8}
                    className="w-20 text-center"
                    aria-label={`Emoji for ${c.name}`}
                  />
                </div>
                <div className="flex w-full gap-2">
                  <Button onClick={() => saveEdit(c.id)} className="flex-1">Save</Button>
                  <Button variant="outline" onClick={() => setEditingId(null)} className="flex-1">Cancel</Button>
                </div>
              </li>
            )
          }
          if (mergingId === c.id) {
            return (
              <li key={c.id} className="flex flex-col gap-2 p-3">
                <label htmlFor={`merge-${c.id}`} className="text-sm">Merge {c.name} into</label>
                <select
                  id={`merge-${c.id}`}
                  value={mergeTargetId ?? ''}
                  onChange={e => onMergeTargetChange(e.target.value || null)}
                  className={FIELD_SELECT}
                >
                  <option value="">Choose a category…</option>
                  {sameKindActive
                    .filter(cat => cat.id !== c.id)
                    .map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon ? `${cat.icon} ${cat.name}` : cat.name}
                      </option>
                    ))}
                </select>
                <div className="flex w-full gap-2">
                  <Button
                    onClick={() => onMergeConfirm(c.id, mergeTargetId ?? '')}
                    disabled={!mergeTargetId || isMerging}
                    className="flex-1"
                  >
                    {isMerging ? 'Merging…' : 'Merge'}
                  </Button>
                  <Button variant="outline" onClick={() => onMergeChange(null)} className="flex-1">Cancel</Button>
                </div>
              </li>
            )
          }
          return (
            <li key={c.id} className="flex min-h-14 items-center justify-between gap-2 py-1 pl-3 pr-1">
              <span className="min-w-0 truncate text-sm">
                {c.icon && <span aria-hidden="true" className="mr-1.5">{c.icon}</span>}
                {c.name}
              </span>
              <RowMenu
                label={`Actions for ${c.name}`}
                open={menuFor === c.id}
                onOpenChange={o => setMenuFor(o ? c.id : null)}
                items={[
                  { label: 'Edit', icon: Pencil, onSelect: () => startEdit(c) },
                  ...(canMerge ? [{ label: 'Merge into…', icon: Merge, onSelect: () => startMerge(c) }] : []),
                  { label: 'Archive', icon: Archive, onSelect: () => onArchive(c.id) },
                ]}
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ArchivedSection({
  archived,
  onRestore,
}: {
  archived: ReturnType<typeof useArchivedCategories>
  onRestore: (id: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <section className="glass flex flex-col gap-2 rounded-2xl p-4">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="-mx-2 flex min-h-11 items-center justify-between rounded-lg px-2 text-left text-sm font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2"
      >
        <span>Archived ({archived.length})</span>
        <ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} aria-hidden />
      </button>
      {isOpen && (
        <ul className="glass-soft divide-y divide-white/10 rounded-lg">
          {archived.map(c => (
            <li key={c.id} className="flex min-h-14 items-center justify-between gap-2 py-1 pl-3 pr-1">
              <span className="min-w-0 truncate text-sm">
                {c.icon && <span aria-hidden="true" className="mr-1.5">{c.icon}</span>}
                {c.name}
              </span>
              <Button variant="ghost" onClick={() => onRestore(c.id)} aria-label={`Restore ${c.name}`}>Restore</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
