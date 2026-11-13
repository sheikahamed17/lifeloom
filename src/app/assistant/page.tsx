'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MessageCircle, Send, RotateCcw } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { buildAgentHistory } from '@/lib/assistant'
import type { AssistantTurn } from '@/lib/assistant'
import { loadThread, saveThread } from '@/lib/assistant-storage'
import { speak, cancelSpeech } from '@/lib/speak'
import { speakableAnswer, type SpokenAnswerInput } from '@/lib/speak-answer'
import { useCategories } from '@/hooks/use-categories'
import { QueryAnswerCard } from '@/components/query-answer-card'
import { QueryTaskListAnswer, QueryLearningListAnswer, QueryNotesListAnswer } from '@/components/query-answers'
import type { QueryPlan } from '@/lib/query-plans'
import { isQueryPlan } from '@/lib/query-plans'
import { LockGate } from '@/components/lock-gate'
import { PageShell } from '@/components/page-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { VoiceRecorder } from '@/components/voice-recorder'

const EXAMPLE_QUESTIONS = [
  'How much did I spend on food this month?',
  'What did I earn last month?',
  'Show my spending by category this week',
  'What are my open tasks?',
]

function isMoneyPlan(payload: unknown): payload is Extract<QueryPlan, { kind: 'query_money' }> {
  return isQueryPlan(payload) && payload.kind === 'query_money'
}

function isTaskPlan(payload: unknown): payload is Extract<QueryPlan, { kind: 'query_task' }> {
  return isQueryPlan(payload) && payload.kind === 'query_task'
}

function isLearningPlan(payload: unknown): payload is Extract<QueryPlan, { kind: 'query_learning' }> {
  return isQueryPlan(payload) && payload.kind === 'query_learning'
}

function isNotesPlan(payload: unknown): payload is Extract<QueryPlan, { kind: 'query_notes' }> {
  return isQueryPlan(payload) && payload.kind === 'query_notes'
}

function AssistantPageInner() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [turns, setTurns] = useState<AssistantTurn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const categories = useCategories(userId ?? undefined)
  const hydratedRef = useRef(false)

  // Stop any in-flight speech when leaving the page.
  useEffect(() => cancelSpeech, [])

  // For a query answer card: speak its result only if this turn's question was a
  // live voice question (turn.viaVoice; dropped by parseThread on reload, so a
  // persisted answer never re-speaks). speak() no-ops when the toggle is off.
  function onResultFor(turn: AssistantTurn): ((input: SpokenAnswerInput) => void) | undefined {
    if (!turn.viaVoice) return undefined
    return (input) => speak(speakableAnswer(input))
  }

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) { router.replace('/login'); return }
      const uid = res.data.user.id
      // Load the persisted thread (local-only, not synced) together with the user
      // id inside this async callback — avoids synchronous setState-in-effect and
      // the ordering hazard of hydrating in a separate effect.
      setTurns(loadThread(uid))
      hydratedRef.current = true
      setUserId(uid)
    })
  }, [router])

  // Persist the thread (capped) whenever it changes, after hydration.
  useEffect(() => {
    if (!userId || !hydratedRef.current) return
    saveThread(userId, turns)
  }, [turns, userId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  async function submitText(userText: string, viaVoice = false) {
    if (busy || !userId) return
    const text = userText.trim()
    if (!text) return

    const userTurn: AssistantTurn = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
    }

    // Build history BEFORE adding the new turn
    const history = buildAgentHistory(turns)

    setBusy(true)

    // Add the user turn to the thread
    setTurns(prev => [...prev, userTurn])

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          categories: categories.map(c => ({ id: c.id, name: c.name, kind: c.kind })),
          history,
        }),
      })

      if (!res.ok) {
        throw new Error(`/api/agent ${res.status}`)
      }

      const data = await res.json() as { intent: string; payload: unknown }

      const assistantTurn: AssistantTurn = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: '',
        intent: data.intent,
        payload: data.payload,
        // Speak this answer aloud iff the question was a live voice question.
        viaVoice: viaVoice || undefined,
      }

      setTurns(prev => [...prev, assistantTurn])
    } catch (err) {
      console.error('Agent error:', err)
      const errorTurn: AssistantTurn = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: 'Sorry, something went wrong. Please try again.',
        intent: 'error',
      }
      setTurns(prev => [...prev, errorTurn])
    } finally {
      setBusy(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = input.trim()
    if (!t || busy || !userId) return
    setInput('')
    void submitText(t)
  }

  function removeTurn(id: string) {
    setTurns(prev => prev.filter(t => t.id !== id))
  }

  function setExampleQuestion(q: string) {
    setInput(q)
  }

  if (!userId) return <AssistantLoading />

  const isEmpty = turns.length === 0

  return (
    <PageShell
      title="Assistant"
      actions={
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={() => { cancelSpeech(); setTurns([]) }}
          disabled={isEmpty}
          aria-label="Clear conversation"
        >
          <RotateCcw className="size-4" aria-hidden />
        </Button>
      }
    >
      {/* Message thread: the page scrolls; the ask bar below stays in reach. */}
      {isEmpty ? (
        <section aria-labelledby="assistant-empty" className="glass flex flex-col gap-4 rounded-2xl p-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <MessageCircle className="size-10 text-muted-foreground" aria-hidden />
            <h2 id="assistant-empty" className="text-lg font-semibold">Ask about your data</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              I can help you understand your money, tasks, learning, and notes.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {EXAMPLE_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                onClick={() => setExampleQuestion(q)}
                className="glass-soft min-h-11 rounded-lg px-4 py-3 text-left text-sm outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent-2"
                type="button"
              >
                {q}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="flex flex-col gap-4">
          {turns.map(turn => (
            <div
              key={turn.id}
              className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {turn.role === 'user' ? (
                // User bubble — right-aligned
                <div className="max-w-xs lg:max-w-md bg-accent-2/20 rounded-2xl px-4 py-3 text-sm">
                  {turn.text}
                </div>
              ) : turn.intent === 'query_money' && isMoneyPlan(turn.payload) ? (
                // Money answer card
                <div className="w-full max-w-md">
                  <QueryAnswerCard
                    userId={userId}
                    plan={turn.payload}
                    onDismiss={() => removeTurn(turn.id)}
                    onResult={onResultFor(turn)}
                  />
                </div>
              ) : turn.intent === 'query_task' && isTaskPlan(turn.payload) ? (
                // Task answer card
                <div className="w-full max-w-md">
                  <QueryTaskListAnswer
                    userId={userId}
                    plan={turn.payload}
                    onDismiss={() => removeTurn(turn.id)}
                    onResult={onResultFor(turn)}
                  />
                </div>
              ) : turn.intent === 'query_learning' && isLearningPlan(turn.payload) ? (
                // Learning answer card
                <div className="w-full max-w-md">
                  <QueryLearningListAnswer
                    userId={userId}
                    plan={turn.payload}
                    onDismiss={() => removeTurn(turn.id)}
                    onResult={onResultFor(turn)}
                  />
                </div>
              ) : turn.intent === 'query_notes' && isNotesPlan(turn.payload) ? (
                // Notes answer card
                <div className="w-full max-w-md">
                  <QueryNotesListAnswer
                    userId={userId}
                    plan={turn.payload}
                    onDismiss={() => removeTurn(turn.id)}
                    onResult={onResultFor(turn)}
                  />
                </div>
              ) : (
                // Text bubble for chat/log/error/unknown
                <div className="max-w-xs lg:max-w-md bg-white/5 rounded-2xl px-4 py-3 text-sm text-muted-foreground">
                  {turn.intent === 'chat' || turn.intent === null
                    ? "I can answer questions about your money, tasks, learning, and notes — e.g. 'How much did I spend on food this month?'"
                    : turn.intent?.startsWith('log_') || turn.intent === 'set_budget'
                    ? "That sounds like something to record — add it from the capture bar on Money home."
                    : turn.text || 'Assistant response'}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div role="status" className="flex w-fit items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              Thinking…
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Ask bar: floating chrome, so it is the one glass layer here. */}
      <form
        onSubmit={handleSubmit}
        className="glass sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 flex items-end gap-2 rounded-2xl p-2"
      >
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about your data…"
          disabled={busy}
          aria-label="Ask about your data"
          enterKeyHint="send"
          className="h-11 flex-1"
        />
        <VoiceRecorder
          transcribeOnly
          onTranscript={(t) => { void submitText(t, true) }}
          disabled={busy || !userId}
        />
        <Button
          type="submit"
          disabled={!input.trim() || busy}
          size="icon-lg"
          aria-label="Send message"
        >
          <Send className="size-4" aria-hidden />
        </Button>
      </form>
    </PageShell>
  )
}

function AssistantLoading() {
  return (
    <PageShell title="Assistant">
      <p role="status" className="text-sm text-muted-foreground">Loading…</p>
    </PageShell>
  )
}

export default function AssistantPage() {
  return (
    <Suspense fallback={<AssistantLoading />}>
      <LockGate>
        <AssistantPageInner />
      </LockGate>
    </Suspense>
  )
}
