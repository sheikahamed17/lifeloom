'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useProjects } from '@/hooks/use-projects'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type Props = {
  userId: string
  selectedId: string | null
  onSelect: (projectId: string | null) => void
  noneLabel?: string
}

const NONE = '__none__'
const CHIP = 'min-h-10 rounded-lg border border-input px-3 text-sm text-muted-foreground aria-pressed:border-accent-2/50 aria-pressed:bg-accent-2/20 aria-pressed:text-accent-2'

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
      <ToggleGroup
        aria-label="Project"
        spacing={1}
        value={[selectedId ?? NONE]}
        onValueChange={v => { const next = v[0]; if (next) onSelect(next === NONE ? null : next) }}
        className="flex-wrap"
      >
        <ToggleGroupItem value={NONE} className={CHIP}>{noneLabel}</ToggleGroupItem>
        {projects.map(p => (
          <ToggleGroupItem key={p.id} value={p.id} className={CHIP}>
            {p.color && <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />}
            {p.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {creating ? (
        <Input
          autoFocus
          aria-label="New project name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createProject() } }}
          onBlur={createProject}
          placeholder="project name…"
          className="w-36"
        />
      ) : (
        <Button variant="outline" onClick={() => setCreating(true)} className="text-muted-foreground">
          <Plus className="size-4" aria-hidden />New project
        </Button>
      )}
    </div>
  )
}
