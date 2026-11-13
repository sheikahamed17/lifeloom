'use client'

import { createContext, useContext, useMemo } from 'react'
import { X } from 'lucide-react'
import { useUndoStack } from '@/hooks/use-undo-stack'

/**
 * App toasts. `push(label, undo)` shows "label · Undo"; `push(label)` shows a plain
 * notice. Every save and every delete reports here, so no action ends in silence.
 */
type UndoApi = { push: (label: string, undo?: () => Promise<void>) => void }

const UndoContext = createContext<UndoApi | null>(null)

export function useUndo(): UndoApi {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error('useUndo must be used within UndoProvider')
  return ctx
}

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const { entries, push, trigger, dismiss } = useUndoStack(6000)
  const value = useMemo(() => ({ push }), [push])
  return (
    <UndoContext.Provider value={value}>
      {children}
      {/* Always mounted so screen readers announce each new toast. Sits above the phone dock. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 lg:bottom-6"
      >
        {entries.map(u => (
          <div key={u.id} className="glass pointer-events-auto flex max-w-full items-center gap-1 rounded-2xl py-1 pl-4 pr-1 text-sm">
            <span className="min-w-0 truncate">{u.label}</span>
            {u.undo && (
              <button
                type="button"
                className="min-h-11 rounded-lg px-3 font-semibold text-accent-2 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent-2"
                onClick={() => trigger(u.id)}
              >
                Undo
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              className="flex size-11 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2"
              onClick={() => dismiss(u.id)}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </UndoContext.Provider>
  )
}
