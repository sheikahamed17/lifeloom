'use client'

import { X } from 'lucide-react'
import { HELP_EXAMPLES } from '@/lib/help-examples'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function HelpCard({
  onPick,
  onDismiss,
}: {
  onPick: (prompt: string) => void
  onDismiss: () => void
}) {
  return (
    <Card role="group" aria-label="Lifeloom help">
      <CardHeader>
        <CardTitle><h2 className="text-sm font-semibold">Here&apos;s what I can do</h2></CardTitle>
        <CardDescription className="text-xs">
          Type or say one line — I&rsquo;ll file it in the right place.
        </CardDescription>
        <CardAction className="-mr-2 -mt-2">
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss help"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        {HELP_EXAMPLES.map((example) => (
          <Button
            key={`${example.domain}-${example.prompt}`}
            variant="outline"
            onClick={() => onPick(example.prompt)}
            className="h-auto min-h-11 flex-col items-start gap-1 whitespace-normal px-3 py-2 text-left"
          >
            <span className="text-sm font-medium">{example.label}</span>
            <code className="font-mono text-xs font-normal text-muted-foreground">
              {example.prompt}
            </code>
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}
