'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isPinSet, shouldRelock } from '@/lib/pin-lock'
import { LockScreen } from '@/components/layout/lock-screen'

export function LockGate({ children }: { children: ReactNode }) {
  // Locked on cold start iff a PIN is configured on this device.
  const [locked, setLocked] = useState(() => (typeof window !== 'undefined' ? isPinSet() : false))
  const lastActive = useRef<number | null>(null)

  useEffect(() => {
    lastActive.current = Date.now()
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        if (isPinSet() && shouldRelock(lastActive.current, Date.now())) setLocked(true)
      } else {
        lastActive.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  if (locked) {
    return <LockScreen onUnlock={() => { lastActive.current = Date.now(); setLocked(false) }} />
  }
  return <>{children}</>
}
