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
import { PageShell } from '@/components/page-shell'
import { RowMenu } from '@/components/row-menu'
import { UndoProvider, useUndo } from '@/components/undo-provider'
import type { ProjectRow } from '@/lib/dexie'

const BACK = { href: '/settings', label: 'Settings' }

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

  if (!userId) {
    return (
      <PageShell title="Projects" back={BACK}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PageShell>
    )
  }

  return (
    <PageShell title="Projects" back={BACK}>
      <section className="glass flex flex-col gap-3 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Add a project</h2>
        <div className="flex gap-2">
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New project…"
            onKeyDown={e => { if (e.key === 'Enter') addProject() }} aria-label="New project name" />
          <Button onClick={addProject}>Add</Button>
        </div>
        <ColourPicker value={newColor} onPick={setNewColor} label="Colour for the new project" />
      </section>

      <section className="glass flex flex-col gap-2 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Your projects</h2>
        <ul className="glass-soft divide-y divide-white/10 rounded-lg">
          {projects.length === 0 && <li className="p-3 text-sm text-muted-foreground">No projects yet.</li>}
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
      </section>
    </PageShell>
  )
}

function ColourPicker({ value, onPick, label }: { value: string | null; onPick: (c: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="-ml-2.5 flex flex-wrap">
      {PALETTE.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          aria-label={COLOUR_NAME[c] ?? c}
          aria-pressed={value === c}
          className="flex size-11 items-center justify-center rounded-lg outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent-2"
        >
          <span
            aria-hidden="true"
            className={cn('size-6 rounded-full border-2', value === c ? 'border-foreground' : 'border-transparent')}
            style={{ backgroundColor: c }}
          />
        </button>
      ))}
    </div>
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
    <li className="flex flex-col gap-1 p-3">
      <div className="flex items-center gap-1">
        <Input value={name} onChange={e => setName(e.target.value)}
          onBlur={() => { const n = name.trim(); if (n && n !== project.name) onWrite(project.id, 'update', { name: n }) }}
          aria-label={`Name of project ${project.name}`} className={cn('flex-1', project.archived && 'text-muted-foreground')} />
        {project.archived ? <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted-foreground">Archived</span> : null}
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
      </div>
      <ColourPicker
        value={project.color}
        onPick={c => onWrite(project.id, 'update', { color: c })}
        label={`Colour for ${project.name}`}
      />
    </li>
  )
}
