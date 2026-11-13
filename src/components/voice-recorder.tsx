'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { callVoiceApiStreaming, type VoiceStreamEvent } from '@/lib/voice-sse'
import { enqueueVoice } from '@/lib/voice-queue'
import { pickAudioMime } from '@/lib/audio-format'

type Props = {
  onParsed?: (payload: unknown, transcript: string, intent?: string) => void
  onTranscript?: (text: string) => void
  transcribeOnly?: boolean
  disabled?: boolean
  /** A secondary 44 px icon beside the capture field (Money home), not the big round hero button. */
  compact?: boolean
}

type RecState = 'idle' | 'recording' | 'transcribing' | 'transcript' | 'parsing' | 'error'

export function VoiceRecorder({ onParsed, onTranscript, transcribeOnly, disabled, compact }: Props) {
  const [state, setState] = useState<RecState>('idle')
  const [transcript, setTranscript] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef   = useRef<Blob[]>([])
  const streamRef   = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  async function start() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream
      // Pick a format the device actually supports. iOS Safari records audio/mp4,
      // not webm; an empty pick means "let the UA choose its default".
      const mime = pickAudioMime(m => MediaRecorder.isTypeSupported(m))
      const recorder = new MediaRecorder(stream, mime
        ? { mimeType: mime, audioBitsPerSecond: 32000 }
        : { audioBitsPerSecond: 32000 })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        // Label the blob with the recorder's NEGOTIATED type (the truth), not the
        // requested string — so the upload filename/extension matches the real bytes.
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mime || 'audio/webm' })
        await processBlob(blob)
      }
      recorder.start()
      recorderRef.current = recorder
      setState('recording')
    } catch (err) {
      setError((err as Error).message || 'mic permission denied')
      setState('error')
    }
  }

  function stop() {
    const r = recorderRef.current
    if (!r || r.state === 'inactive') return
    setState('transcribing')
    r.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  async function processBlob(blob: Blob) {
    setState('transcribing')
    setTranscript(null)
    setError(null)

    let serverError: string | null = null
    let capturedTranscript: string | null = null
    const final = await callVoiceApiStreaming(blob, (event: VoiceStreamEvent) => {
      if (event.step === 'transcribing') setState('transcribing')
      else if (event.step === 'transcript') {
        capturedTranscript = event.text
        setTranscript(event.text)
        setState('transcript')
      }
      else if (event.step === 'parsing') setState('parsing')
      else if (event.step === 'error') serverError = event.message
    }, transcribeOnly ? { transcribeOnly: true } : {})

    // Transcribe-only mode: emit transcript and stop
    if (transcribeOnly) {
      if (capturedTranscript) {
        onTranscript?.(capturedTranscript)
      } else {
        setError("Couldn't transcribe that — please try again")
      }
      setState('idle')
      setTranscript(null)
      return
    }

    // Full parse mode: handle result and queue offline failures
    if (final) {
      onParsed?.(final.payload, final.transcript, final.intent)
      setState('idle')
      setTranscript(null)
      return
    }

    // No result. Only a genuine offline/network drop is worth queuing — the queue
    // drains on the next offline→online transition, so re-queuing while online just
    // silently re-fails, and "will retry when online" is misleading when you're online.
    // An online failure (bad audio, rate limit, server error) must surface its real
    // message so it's actionable instead of masked behind a fake "queued".
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    if (offline) {
      await enqueueVoice(blob)
      setError('Queued — will retry when online')
    } else {
      console.warn('voice-sse: no payload while online:', serverError)
      setError(serverError ?? "Couldn't process that — please try again")
    }
    setState('idle')
  }

  const busy = state === 'transcribing' || state === 'transcript' || state === 'parsing'
  // Status only when something is happening: no "tap to record" helper at rest.
  const status =
    state === 'recording' ? 'Listening… tap to stop'
    : state === 'transcribing' ? 'Transcribing…'
    : state === 'transcript' && transcript ? `I heard “${transcript}”`
    : state === 'parsing' ? 'Understanding…'
    : state === 'error' ? (error ?? 'Something went wrong')
    : error

  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={state === 'recording' ? stop : start}
          aria-label={state === 'recording' ? 'Stop recording' : 'Record a voice capture'}
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-2 disabled:pointer-events-none disabled:opacity-50',
            state === 'recording' ? 'bg-destructive/15 text-destructive' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground',
          )}
        >
          {busy ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
            : state === 'recording' ? <Square className="size-4 fill-current" aria-hidden />
            : <Mic className="size-5" aria-hidden />}
        </button>
        {status && (
          <span role="status" className={cn('min-w-0 truncate text-xs', state === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
            {status}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={state === 'recording' ? stop : start}
          className="flex size-16 items-center justify-center rounded-full bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] text-primary-foreground glow-cta transition disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-accent-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={state === 'recording' ? 'Stop recording' : 'Start recording'}
        >
          {busy ? <Loader2 className="size-6 animate-spin motion-reduce:animate-none" aria-hidden /> : <Mic className="size-6" aria-hidden />}
        </button>
        {state === 'recording' && (
          // pointer-events-none: this decorative ring overlays the button; without
          // it, the ring swallows the tap and "tap again to stop" never fires stop().
          <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-accent-2/50 motion-safe:animate-pulse" />
        )}
      </div>
      {status && (
        <p role="status" className={cn('text-xs', state === 'error' ? 'text-destructive' : 'text-muted-foreground')}>{status}</p>
      )}
    </div>
  )
}
