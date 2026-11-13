'use client'

import { useState } from 'react'
import { useProjects } from '@/hooks/use-projects'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { cn } from '@/lib/utils'

type Props = {
  userId: string
  selectedId: string | null
  onSelect: (projectId: string | null) => void
  noneLabel?: string
}

export function ProjectPicker({ userId, selectedId, onSelect, noneLabel = 'No project' }: Props) {
  const projects = useProjects(userId)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  async function createProject() {
    const n = name.trim()
    if (!n) { setCreating(false); setName(''); return }
    const id = crypto.randomUUID()
    await applyLocalOp(await generateOp({
      entity_kind: 'project', entity_id: id, op_type: 'create',
      payload: { name: n, color: null, archived: 0 }, user_id: userId,
    }))
    pushPullOnce({ userId }).catch(err => console.error('sync', err))
    setName(''); setCreating(false); onSelect(id)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => onSelect(null)}
        className={cn('rounded-lg border px-2 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none',
          selectedId === null ? 'bg-accent-2/20 border-accent-2/50 text-accent-2' : 'bg-muted')}>
        {noneLabel}
      </button>
      {projects.map(p => (
        <button key={p.id} type="button" onClick={() => onSelect(p.id)}
          className={cn('inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none',
            selectedId === p.id ? 'bg-accent-2/20 border-accent-2/50 text-accent-2' : 'bg-muted')}>
          {p.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />}
          {p.name}
        </button>
      ))}
      {creating ? (
        <input autoFocus value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createProject() } }}
          onBlur={createProject} placeholder="project name…"
          className="glass-soft w-28 rounded-lg px-2 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none" />
      ) : (
        <button type="button" onClick={() => setCreating(true)}
          className="rounded-lg border bg-muted px-2 py-0.5 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none">
          + New project
        </button>
      )}
    </div>
  )
}
