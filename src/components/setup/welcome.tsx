'use client'

import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Sparkles className="size-8 text-accent-2" aria-hidden />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Welcome to your Lifeloom</h1>
        <p className="text-sm text-muted-foreground">
          This is your own private instance — your data, your keys, fully isolated and yours alone. Let&apos;s get it set up; it takes about a minute.
        </p>
      </div>
      <Button onClick={onNext} className="w-full">Get started</Button>
    </div>
  )
}
