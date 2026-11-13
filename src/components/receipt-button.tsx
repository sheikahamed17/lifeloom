'use client'

import { useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import type { ReceiptStreamEvent } from '@/lib/receipt-sse'
import { callReceiptApiStreaming } from '@/lib/receipt-sse'
import { enqueueReceipt } from '@/lib/receipt-queue'
import { cn } from '@/lib/utils'

type Props = {
  disabled: boolean
  onParsed: (payload: unknown, previewUrl: string) => void
}

export function ReceiptButton({ disabled, onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'uploading' | 'parsing' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleFile(file: File) {
    setState('uploading')
    setErrorMsg('')
    const previewUrl = URL.createObjectURL(file)

    try {
      const result = await callReceiptApiStreaming(file, (event: ReceiptStreamEvent) => {
        if (event.step === 'uploading') setState('uploading')
        else if (event.step === 'parsing') setState('parsing')
      })

      if (result) {
        onParsed(result.payload, previewUrl)
        setState('idle')
      } else {
        setErrorMsg('No payload received from server')
        setState('error')
      }
    } catch (err) {
      setErrorMsg((err as Error).message)
      setState('error')
      // Enqueue the receipt for later retry
      await enqueueReceipt(file)
    }
  }

  const status = state === 'uploading' ? 'Uploading receipt…' : state === 'parsing' ? 'Reading receipt…' : state === 'error' ? `Receipt failed: ${errorMsg || 'try again'}` : null
  return (
    <div className="flex min-w-0 items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          if (file) handleFile(file)
          e.currentTarget.value = ''
        }}
      />
      <button
        type="button"
        disabled={disabled || state === 'uploading' || state === 'parsing'}
        onClick={() => inputRef.current?.click()}
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2 disabled:pointer-events-none disabled:opacity-50"
        aria-label="Scan a receipt"
      >
        {state === 'uploading' || state === 'parsing'
          ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
          : <Camera className="size-5" aria-hidden />}
      </button>
      {status && (
        <span role="status" className={cn('min-w-0 truncate text-xs', state === 'error' ? 'text-destructive' : 'text-muted-foreground')}>{status}</span>
      )}
    </div>
  )
}
