'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Merge, Pencil } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { useCategories } from '@/hooks/use-categories'
import { useArchivedCategories } from '@/hooks/use-archived-categories'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { planCategoryMerge } from '@/lib/category-merge'
import { db } from '@/lib/dexie'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { ArchivedCollapsible, COUNT_CLASS, FormField, SELECT_CLASS, SettingsCard } from '../_ui'
import { PageShell } from '@/components/layout/page-shell'
import { RowMenu } from '@/components/shared/row-menu'
import { UndoProvider, useUndo } from '@/components/providers/undo-provider'
import type { CategoryRow } from '@/lib/dexie'

const BACK = { href: '/settings', label: 'Settings' }
const DESCRIPTION = 'Add, rename, merge and archive spend and income categories.'

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
      payload: { name: newName.trim(), kind, sort_order: sortOrder, icon: null },
      user_id: userId,
    })
    await applyLocalOp(op)
    setNewName('')
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
      <PageShell title="Categories" back={BACK} description={DESCRIPTION}>
        <Skeleton className="h-40 w-full rounded-xl" role="status" aria-label="Loading" />
      </PageShell>
    )
  }

  return (
    <PageShell title="Categories" back={BACK} description={DESCRIPTION}>
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

      <SettingsCard title="Add a category">
        <FormField label="Name" htmlFor="cat-name">
          <Input id="cat-name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Health" maxLength={40} aria-label="Category name" />
        </FormField>
        <FormField label="Spend or income" htmlFor="cat-kind">
          <NativeSelect
            id="cat-kind"
            value={kind}
            onChange={e => setKind(e.target.value as 'spend' | 'income')}
            className={SELECT_CLASS}
            aria-label="Spend or income"
          >
            <NativeSelectOption value="spend">Spend</NativeSelectOption>
            <NativeSelectOption value="income">Income</NativeSelectOption>
          </NativeSelect>
        </FormField>
        <Button size="lg" onClick={addCategory}>Add category</Button>
      </SettingsCard>

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
  const [menuFor, setMenuFor] = useState<string | null>(null)

  function startEdit(c: CategoryRow) {
    setEditingId(c.id)
    setEditName(c.name)
    onMergeChange(null)
  }

  async function saveEdit(id: string) {
    const trimmed = editName.trim()
    if (!trimmed) return
    // The emoji field is gone from the form; the stored icon is passed through unchanged.
    await onUpdate(id, { name: trimmed, icon: categories.find(c => c.id === id)?.icon ?? null })
    setEditingId(null)
  }

  function startMerge(c: CategoryRow) {
    onMergeChange(c.id)
    onMergeTargetChange(null)
    setEditingId(null)
  }

  return (
    <SettingsCard
      title={title}
      className="gap-0"
      contentClassName="gap-0"
      action={categories.length > 0 ? <span className={COUNT_CLASS}>{categories.length}</span> : undefined}
    >
      <ul>
        {categories.length === 0 && <li className="border-b border-border"><Empty className="px-0 py-6"><EmptyDescription>No {title.toLowerCase()} categories.</EmptyDescription></Empty></li>}
        {categories.map(c => {
          const sameKindActive = allCategories.filter(cat => cat.kind === c.kind)
          const canMerge = sameKindActive.length >= 2
          if (editingId === c.id) {
            return (
              <li key={c.id} className="flex flex-col gap-3 border-b border-border py-4">
                <FormField label="Name" htmlFor={`cat-edit-${c.id}`}>
                  <Input
                    id={`cat-edit-${c.id}`}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    maxLength={40}
                    autoFocus
                    aria-label={`New name for ${c.name}`}
                  />
                </FormField>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => saveEdit(c.id)}>Save</Button>
                  <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </li>
            )
          }
          if (mergingId === c.id) {
            return (
              <li key={c.id} className="border-b border-border py-2">
                <div className="flex flex-col gap-2.5 rounded-2xl bg-card p-4">
                  <Label htmlFor={`merge-${c.id}`} className="text-[15px] font-semibold text-foreground">Merge {c.name} into</Label>
                  <NativeSelect
                    id={`merge-${c.id}`}
                    value={mergeTargetId ?? ''}
                    onChange={e => onMergeTargetChange(e.target.value || null)}
                    className={cn(SELECT_CLASS, '[&_select]:border-border')}
                  >
                    <NativeSelectOption value="">Choose a category…</NativeSelectOption>
                    {sameKindActive
                      .filter(cat => cat.id !== c.id)
                      .map(cat => (
                        <NativeSelectOption key={cat.id} value={cat.id}>{cat.name}</NativeSelectOption>
                      ))}
                  </NativeSelect>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => onMergeConfirm(c.id, mergeTargetId ?? '')}
                      disabled={!mergeTargetId || isMerging}
                    >
                      {isMerging ? 'Merging…' : 'Merge'}
                    </Button>
                    <Button variant="outline" onClick={() => onMergeChange(null)}>Cancel</Button>
                  </div>
                </div>
              </li>
            )
          }
          return (
            <li key={c.id} className="flex min-h-[52px] items-center justify-between gap-3 border-b border-border">
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{c.name}</span>
              <div className="-mr-2.5 flex shrink-0">
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
              </div>
            </li>
          )
        })}
      </ul>
    </SettingsCard>
  )
}

function ArchivedSection({
  archived,
  onRestore,
}: {
  archived: ReturnType<typeof useArchivedCategories>
  onRestore: (id: string) => void
}) {
  return (
    <ArchivedCollapsible count={archived.length}>
      <ul>
        {archived.map(c => (
          <li key={c.id} className="flex min-h-[52px] items-center justify-between gap-3 border-b border-border">
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{c.name}</span>
            <Button variant="link" className="shrink-0 px-1" onClick={() => onRestore(c.id)} aria-label={`Restore ${c.name}`}>Restore</Button>
          </li>
        ))}
      </ul>
    </ArchivedCollapsible>
  )
}
