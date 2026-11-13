'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

type Props = {
  title: string
  count: number
  onDismiss: () => void
  children: React.ReactNode
}

const AUTO_DISMISS_MS = 30_000

export function QueryListAnswer({ title, count, onDismiss, children }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-accent-2">
          {title}
        </h3>
        <span className="font-mono text-xs text-accent-2">{count}</span>
      </div>

      <div className="mb-4 max-h-[60vh] overflow-y-auto">
        {count === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing matches</p>
        ) : (
          children
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onDismiss}
        className="w-full min-h-11 flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-accent-2"
        aria-label="Dismiss results"
      >
        <X className="h-4 w-4" />
        Dismiss
      </Button>
    </div>
  )
}
