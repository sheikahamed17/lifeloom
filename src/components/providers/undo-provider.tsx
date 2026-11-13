'use client'

import { createContext, useContext, useMemo } from 'react'
import { toast } from 'sonner'

/**
 * App toasts, shown by sonner (the single `<Toaster />` lives in the root layout,
 * above the phone dock). `push(label, undo)` shows "label · Undo"; `push(label)`
 * shows a plain notice. Every save and every delete reports here, so no action
 * ends in silence. Sonner owns the aria-live region, timing and swipe-to-dismiss.
 */
type UndoApi = { push: (label: string, undo?: () => Promise<void>) => void }

const TOAST_MS = 6000

function push(label: string, undo?: () => Promise<void>) {
  toast(label, {
    duration: TOAST_MS,
    action: undo
      ? { label: 'Undo', onClick: () => { undo().catch(err => console.error('undo', err)) } }
      : undefined,
  })
}

const UndoContext = createContext<UndoApi | null>(null)

export function useUndo(): UndoApi {
  const ctx = useContext(UndoContext)
  if (!ctx) throw new Error('useUndo must be used within UndoProvider')
  return ctx
}

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(() => ({ push }), [])
  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>
}
