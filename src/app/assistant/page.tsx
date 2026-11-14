'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { buildAgentHistory } from '@/lib/assistant'
import type { AssistantTurn } from '@/lib/assistant'
import { loadThread, saveThread } from '@/lib/assistant-storage'
import { speak, cancelSpeech } from '@/lib/speak'
import { speakableAnswer, type SpokenAnswerInput } from '@/lib/speak-answer'
import { useCategories } from '@/hooks/use-categories'
import { QueryAnswerCard } from '@/components/capture/query-answer-card'
import { QueryTaskListAnswer, QueryLearningListAnswer, QueryNotesListAnswer } from '@/components/capture/query-answers'
import type { QueryPlan } from '@/lib/query-plans'
import { isQueryPlan } from '@/lib/query-plans'
import { LockGate } from '@/components/layout/lock-gate'
import { PageShell } from '@/components/layout/page-shell'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { VoiceRecorder } from '@/components/capture/voice-recorder'

const DESCRIPTION = 'Ask about your money, tasks, learning and notes.'

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

  function clearConversation() { cancelSpeech(); setTurns([]) }

  return (
    <PageShell
      title="Assistant"
      description={DESCRIPTION}
      width="wide"
      actions={
        // Phone: the clear action sits by the title. Desktop has it under the ask field.
        <Button variant="link" onClick={clearConversation} disabled={isEmpty} aria-label="Clear conversation" className="px-0 lg:hidden">
          Clear conversation
        </Button>
      }
    >
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-14">
        {/* Message thread: the page scrolls; the ask field below stays in reach. */}
        {isEmpty ? (
          <section role="region" aria-labelledby="assistant-empty" className="flex min-w-0 flex-col">
            <div className="border-b border-border pb-2.5">
              <h2 id="assistant-empty" className="text-[19px] font-bold tracking-[-0.02em] lg:text-[22px]">Ask about your data</h2>
            </div>
            <ul className="flex flex-col">
              {EXAMPLE_QUESTIONS.map((q, idx) => (
                <li key={idx} className="border-b border-border">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setExampleQuestion(q)}
                    className="h-auto min-h-[52px] w-full justify-start whitespace-normal rounded-none px-0 py-2 text-left text-[15px] font-medium hover:bg-transparent hover:underline"
                  >
                    {q}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section aria-label="Conversation" className="flex min-w-0 flex-col gap-4">
            {turns.map(turn => (
              <div
                key={turn.id}
                className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {turn.role === 'user' ? (
                  // The question: the one raised surface in the thread, right-aligned.
                  <div className="max-w-[280px] rounded-2xl bg-card px-4 py-3 text-[15px] leading-[1.4] lg:max-w-[420px]">
                    {turn.text}
                  </div>
                ) : turn.intent === 'query_money' && isMoneyPlan(turn.payload) ? (
                  // Money answer
                  <div className="w-full max-w-[480px]">
                    <QueryAnswerCard
                      userId={userId}
                      plan={turn.payload}
                      onDismiss={() => removeTurn(turn.id)}
                      onResult={onResultFor(turn)}
                    />
                  </div>
                ) : turn.intent === 'query_task' && isTaskPlan(turn.payload) ? (
                  // Task answer
                  <div className="w-full max-w-[480px]">
                    <QueryTaskListAnswer
                      userId={userId}
                      plan={turn.payload}
                      onDismiss={() => removeTurn(turn.id)}
                      onResult={onResultFor(turn)}
                    />
                  </div>
                ) : turn.intent === 'query_learning' && isLearningPlan(turn.payload) ? (
                  // Learning answer
                  <div className="w-full max-w-[480px]">
                    <QueryLearningListAnswer
                      userId={userId}
                      plan={turn.payload}
                      onDismiss={() => removeTurn(turn.id)}
                      onResult={onResultFor(turn)}
                    />
                  </div>
                ) : turn.intent === 'query_notes' && isNotesPlan(turn.payload) ? (
                  // Notes answer
                  <div className="w-full max-w-[480px]">
                    <QueryNotesListAnswer
                      userId={userId}
                      plan={turn.payload}
                      onDismiss={() => removeTurn(turn.id)}
                      onResult={onResultFor(turn)}
                    />
                  </div>
                ) : (
                  // Plain text on the ground for chat/log/error/unknown
                  <p className="max-w-[300px] text-[15px] leading-[1.45] text-muted-foreground lg:max-w-[440px]">
                    {turn.intent === 'chat' || turn.intent === null
                      ? "I can answer questions about your money, tasks, learning, and notes, for example 'How much did I spend on food this month?'"
                      : turn.intent?.startsWith('log_') || turn.intent === 'set_budget'
                      ? "That sounds like something to record. Add it from the capture bar on Money home."
                      : turn.text || 'Assistant response'}
                  </p>
                )}
              </div>
            ))}
            {busy && (
              <p role="status" className="flex w-fit items-center gap-2 text-[15px] text-muted-foreground">
                <Spinner className="motion-reduce:animate-none" aria-hidden />
                Thinking…
              </p>
            )}
            <div ref={messagesEndRef} />
          </section>
        )}

        {/* Ask field: pinned to the bottom of the phone screen, a side column on desktop. */}
        <div className="sticky bottom-0 z-10 -mx-5 flex flex-col gap-4 bg-background px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:-mx-6 sm:px-6 lg:top-6 lg:bottom-auto lg:mx-0 lg:p-0">
          <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
            {!isEmpty && <p aria-hidden className="hidden text-[17px] font-bold lg:block">Ask about your data</p>}
            <InputGroup className="h-13 rounded-2xl border-0 bg-card p-1 pl-2 has-disabled:bg-card has-disabled:opacity-100">
              <InputGroupInput
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask about your data…"
                disabled={busy}
                aria-label="Ask about your data"
                enterKeyHint="send"
                className="h-full text-[15px]"
              />
              <InputGroupAddon align="inline-end" className="gap-1 py-0 pr-0 has-[>button]:mr-0">
                <VoiceRecorder
                  compact
                  transcribeOnly
                  onTranscript={(t) => { void submitText(t, true) }}
                  disabled={busy || !userId}
                />
                <InputGroupButton
                  type="submit"
                  variant="default"
                  disabled={!input.trim() || busy}
                  size="icon-sm"
                  className="size-11 rounded-xl"
                  aria-label="Send message"
                >
                  <Send className="size-4" aria-hidden />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
          <Button variant="outline" onClick={clearConversation} disabled={isEmpty} aria-label="Clear conversation" className="hidden w-fit lg:inline-flex">
            Clear conversation
          </Button>
        </div>
      </div>
    </PageShell>
  )
}

function AssistantLoading() {
  return (
    <PageShell title="Assistant" description={DESCRIPTION} width="wide">
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden />Loading…</p>
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
