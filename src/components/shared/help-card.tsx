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
        <CardTitle><h2>Here&apos;s what I can do</h2></CardTitle>
        <CardDescription className="text-[13px]">
          Type or say one line and I&rsquo;ll file it in the right place.
        </CardDescription>
        <CardAction className="-mr-2 self-center">
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

      <CardContent className="-mt-4 flex flex-col divide-y divide-border">
        {HELP_EXAMPLES.map((example) => (
          <Button
            key={`${example.domain}-${example.prompt}`}
            variant="ghost"
            onClick={() => onPick(example.prompt)}
            className="h-auto min-h-[52px] flex-col items-start gap-0.5 whitespace-normal rounded-none px-0 py-2.5 text-left"
          >
            <span className="text-[15px] font-medium">{example.label}</span>
            <code className="font-sans text-[13px] font-normal text-muted-foreground">
              {example.prompt}
            </code>
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}
