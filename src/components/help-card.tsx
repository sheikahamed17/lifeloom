'use client'

import { X } from 'lucide-react'
import { HELP_EXAMPLES } from '@/lib/help-examples'

export function HelpCard({
  onPick,
  onDismiss,
}: {
  onPick: (prompt: string) => void
  onDismiss: () => void
}) {
  return (
    <div
      className="glass rounded-2xl flex flex-col gap-3 p-4"
      role="group"
      aria-label="Lifeloom help"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h2 className="text-sm font-semibold">Here&apos;s what I can do</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Type or say one line — I&rsquo;ll file it in the right place.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss help"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {HELP_EXAMPLES.map((example) => (
          <button
            key={`${example.domain}-${example.prompt}`}
            type="button"
            onClick={() => onPick(example.prompt)}
            className="flex flex-col gap-1 items-start min-h-[44px] px-3 py-2 rounded bg-white/5 hover:bg-white/10 transition-colors text-left"
          >
            <span className="text-xs font-medium">{example.label}</span>
            <code className="text-xs text-muted-foreground font-mono">
              {example.prompt}
            </code>
          </button>
        ))}
      </div>
    </div>
  )
}
