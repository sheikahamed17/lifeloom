'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type UndoEntry = {
  id: string
  label: string
  /** Absent for a plain notice ("Changes saved"): the toast shows no Undo button. */
  undo?: () => Promise<void>
  expiresAt: number
}

export function useUndoStack(ttlMs = 5000) {
  const [entries, setEntries] = useState<UndoEntry[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  const push = useCallback((label: string, undo?: () => Promise<void>) => {
    const id = crypto.randomUUID()
    const entry: UndoEntry = { id, label, undo, expiresAt: Date.now() + ttlMs }
    setEntries(prev => [...prev, entry])
    const timer = setTimeout(() => {
      setEntries(prev => prev.filter(e => e.id !== id))
      timersRef.current.delete(id)
    }, ttlMs)
    timersRef.current.set(id, timer)
  }, [ttlMs])

  const trigger = useCallback(async (id: string) => {
    const entry = entries.find(e => e.id === id)
    if (!entry) return
    const timer = timersRef.current.get(id)
    if (timer) { clearTimeout(timer); timersRef.current.delete(id) }
    setEntries(prev => prev.filter(e => e.id !== id))
    await entry.undo?.()
  }, [entries])

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) { clearTimeout(timer); timersRef.current.delete(id) }
    setEntries(prev => prev.filter(e => e.id !== id))
  }, [])

  return { entries, push, trigger, dismiss }
}
