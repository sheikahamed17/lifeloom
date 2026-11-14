'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { useProjects } from '@/hooks/use-projects'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SettingsCard } from '../_ui'
import { PageShell } from '@/components/layout/page-shell'
import { RowMenu } from '@/components/shared/row-menu'
import { UndoProvider, useUndo } from '@/components/providers/undo-provider'
import type { ProjectRow } from '@/lib/dexie'

const BACK = { href: '/settings', label: 'Settings' }
const LABEL = 'text-[13px] font-semibold text-muted-foreground'

/** Project colours are user data (stored per project), named for screen readers. */
const PALETTE = ['#6f7bff', '#34e6ff', '#f97316', '#22c55e', '#e11d48', '#a855f7']
const COLOUR_NAME: Record<string, string> = {
  '#6f7bff': 'Indigo', '#34e6ff': 'Cyan', '#f97316': 'Orange', '#22c55e': 'Green', '#e11d48': 'Red', '#a855f7': 'Purple',
}

type WriteFn = (id: string, op: 'create' | 'update' | 'delete', payload: Record<string, unknown>) => Promise<void>

export default function ProjectsPage() {
  return (
    <UndoProvider>
      <ProjectsPageInner />
    </UndoProvider>
  )
}

function ProjectsPageInner() {
  const router = useRouter()
  const undo = useUndo()
  const [userId, setUserId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string>(PALETTE[0])

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  const projects = useProjects(userId ?? undefined, true)

  const write: WriteFn = (entity_id, op_type, payload) => {
    if (!userId) return Promise.resolve()
    return generateOp({ entity_kind: 'project', entity_id, op_type, payload, user_id: userId })
      .then(applyLocalOp)
      .then(() => pushPullOnce({ userId }))
      .then(() => undefined)
      .catch(err => console.error('project write', err))
  }

  function addProject() {
    if (!newName.trim()) return
    write(crypto.randomUUID(), 'create', { name: newName.trim(), color: newColor, archived: 0 })
    setNewName('')
  }

  function toggleArchive(p: ProjectRow) {
    const archiving = !p.archived
    write(p.id, 'update', { archived: archiving ? 1 : 0 })
    if (archiving) undo.push(`Archived ${p.name}`, () => write(p.id, 'update', { archived: 0 }))
  }

  function deleteProject(p: ProjectRow) {
    write(p.id, 'delete', {})
    // Undo re-asserts one field with a newer clock, which clears the tombstone.
    undo.push(`Deleted ${p.name}`, () => write(p.id, 'update', { name: p.name }))
  }

  const archivedCount = projects.filter(p => p.archived).length
  const activeCount = projects.length - archivedCount
  const countLine = archivedCount > 0 ? `${activeCount} active, ${archivedCount} archived` : `${activeCount} active`

  if (!userId) {
    return (
      <PageShell title="Projects" back={BACK}>
        <Skeleton className="h-40 w-full rounded-2xl" role="status" aria-label="Loading" />
      </PageShell>
    )
  }

  return (
    <PageShell title="Projects" back={BACK}>
      <SettingsCard title="Add a project" contentClassName="gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:gap-x-5">
        <div className="flex min-w-0 flex-col gap-2 lg:flex-1 lg:basis-60">
          <Label htmlFor="new-project" className={LABEL}>Name</Label>
          <div className="flex items-center gap-2">
            <Input id="new-project" value={newName} onChange={e => setNewName(e.target.value)} placeholder="New project"
              onKeyDown={e => { if (e.key === 'Enter') addProject() }} aria-label="New project name" className="min-w-0 flex-1" />
            <Button onClick={addProject} className="h-12 px-5 text-[15px] lg:hidden">Add</Button>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 lg:gap-2">
          <p className={LABEL}>Colour</p>
          <ColourPicker value={newColor} onPick={setNewColor} label="Colour for the new project" className="lg:h-12" />
        </div>
        <Button onClick={addProject} className="hidden h-12 px-7 text-[15px] lg:inline-flex">Add</Button>
      </SettingsCard>

      <SettingsCard
        title="Your projects"
        action={projects.length > 0 ? <p className="text-[13px] font-normal text-muted-foreground">{countLine}</p> : undefined}
        className="gap-0"
        contentClassName="gap-0"
      >
        <ul className="flex flex-col">
          {projects.length === 0 && <li className="border-b border-border"><Empty className="items-start p-0 py-4 text-left"><EmptyDescription>No projects yet.</EmptyDescription></Empty></li>}
          {projects.map(p => (
            <ProjectRowItem
              key={p.id}
              project={p}
              onWrite={write}
              onToggleArchive={() => toggleArchive(p)}
              onDelete={() => deleteProject(p)}
            />
          ))}
        </ul>
      </SettingsCard>
    </PageShell>
  )
}

function ColourPicker({ value, onPick, label, className }: { value: string | null; onPick: (c: string) => void; label: string; className?: string }) {
  return (
    <ToggleGroup
      aria-label={label}
      value={value ? [value] : []}
      onValueChange={v => { if (v[0]) onPick(v[0]) }}
      spacing={1}
      className={cn('-ml-2.5 flex-wrap gap-0', className)}
    >
      {PALETTE.map(c => (
        <ToggleGroupItem
          key={c}
          value={c}
          aria-label={COLOUR_NAME[c] ?? c}
          className="size-11 min-w-11 rounded-full border-0 bg-transparent p-0 hover:bg-transparent aria-pressed:bg-transparent"
        >
          <span
            aria-hidden="true"
            className={cn('size-6 rounded-full border-2 bg-clip-content', value === c ? 'border-foreground p-0.5' : 'border-transparent')}
            style={{ backgroundColor: c }}
          />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function ProjectRowItem({
  project, onWrite, onToggleArchive, onDelete,
}: {
  project: ProjectRow
  onWrite: WriteFn
  onToggleArchive: () => void
  onDelete: () => void
}) {
  const [name, setName] = useState(project.name)
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <li className="flex flex-col gap-0.5 border-b border-border pb-1.5 pt-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-4 lg:py-3">
      {/* One row on phone (name, state, menu) with the colours below; a single line on desktop. */}
      <div className="flex min-w-0 items-center gap-1 lg:contents">
        <Input value={name} onChange={e => setName(e.target.value)}
          onBlur={() => { const n = name.trim(); if (n && n !== project.name) onWrite(project.id, 'update', { name: n }) }}
          aria-label={`Name of project ${project.name}`}
          className={cn('min-w-0 flex-1 font-medium lg:order-1 lg:basis-56', project.archived && 'text-muted-foreground')} />
        {project.archived ? <span className="shrink-0 pl-2 pr-1 text-[13px] text-muted-foreground lg:order-3 lg:w-16 lg:p-0">Archived</span> : <span aria-hidden className="hidden w-16 shrink-0 lg:order-3 lg:block" />}
        <span className="-mr-3 flex shrink-0 lg:order-4">
          <RowMenu
            label={`Actions for ${project.name}`}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            items={[
              project.archived
                ? { label: 'Restore', icon: ArchiveRestore, onSelect: onToggleArchive }
                : { label: 'Archive', icon: Archive, onSelect: onToggleArchive },
              { label: 'Delete', icon: Trash2, destructive: true, onSelect: onDelete },
            ]}
          />
        </span>
      </div>
      <ColourPicker
        value={project.color}
        onPick={c => onWrite(project.id, 'update', { color: c })}
        label={`Colour for ${project.name}`}
        className="lg:order-2"
      />
    </li>
  )
}
