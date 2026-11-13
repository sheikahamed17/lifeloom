'use client'

import { X } from 'lucide-react'
import { HELP_EXAMPLES } from '@/lib/help-examples'
import { Button } from '@/components/ui/button'

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
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={onDismiss}
          className="-mr-2 -mt-2 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss help"
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {HELP_EXAMPLES.map((example) => (
          <button
            key={`${example.domain}-${example.prompt}`}
            type="button"
            onClick={() => onPick(example.prompt)}
            className="glass-soft flex min-h-11 flex-col items-start gap-1 rounded-lg px-3 py-2 text-left outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent-2"
          >
            <span className="text-sm font-medium">{example.label}</span>
            <code className="text-xs text-muted-foreground font-mono">
              {example.prompt}
            </code>
          </button>
        ))}
      </div>
    </div>
  )
}
