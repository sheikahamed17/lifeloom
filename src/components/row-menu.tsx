'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export type RowMenuItem = {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  onSelect: () => void
  destructive?: boolean
}

type Props = {
  /** Accessible name of the trigger, e.g. "Actions for Swiggy −₹420". */
  label: string
  items: RowMenuItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The visible "⋯" on every row: the keyboard and screen-reader path to Edit and
 * Delete that a long-press alone never gave (critique P1). The panel renders in a
 * portal at a fixed position, so a row's overflow-hidden can't clip it. Escape,
 * an outside press, scrolling or resizing closes it; focus returns to the trigger.
 */
export function RowMenu({ label, items, open, onOpenChange }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number; up: boolean } | null>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const up = r.bottom + 220 > window.innerHeight
    setPos({ top: up ? r.top : r.bottom, right: window.innerWidth - r.right, up })
  }, [open])

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const close = (refocus: boolean) => {
      onOpenChange(false)
      if (refocus) triggerRef.current?.focus()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const els = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
      const i = els.indexOf(document.activeElement as HTMLButtonElement)
      const next = e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length
      e.preventDefault()
      els[next]?.focus()
    }
    function onPointer(e: PointerEvent) {
      const t = e.target as Node
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) close(false)
    }
    const onScroll = () => close(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', onScroll)
    }
  }, [open, onOpenChange])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={e => { e.stopPropagation(); onOpenChange(!open) }}
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2"
      >
        <MoreHorizontal className="size-5" aria-hidden />
      </button>
      {open && pos && createPortal(
        <div
          ref={panelRef}
          role="menu"
          aria-label={label}
          style={{ top: pos.top, right: pos.right }}
          className={cn('glass fixed z-50 flex min-w-44 flex-col rounded-2xl p-1', pos.up ? '-translate-y-full -mt-1' : 'mt-1')}
        >
          {items.map(it => {
            const Icon = it.icon
            return (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                onClick={e => { e.stopPropagation(); onOpenChange(false); it.onSelect() }}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm outline-none hover:bg-white/10 focus-visible:bg-white/10',
                  it.destructive && 'text-destructive',
                )}
              >
                {Icon && <Icon className="size-4" aria-hidden />}
                {it.label}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
