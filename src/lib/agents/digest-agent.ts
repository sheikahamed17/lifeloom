import type Groq from 'groq-sdk'
import type { DigestMetrics } from '@/lib/digest-aggregate'
import { currencySymbol } from '@/lib/currency'

export function buildDigestSystemPrompt({ weekLabel }: { weekLabel: string }): string {
  return `You are a warm, terse personal financial advisor. Write a 3–4 sentence digest of the week's money, tasks, learning, and notes activity. Never ask questions. Mention the biggest spending category, task throughput, and anything learned/noted worth calling out. Keep it human and encouraging.

Week: ${weekLabel}`
}

export function fallbackSummary(metrics: DigestMetrics): string {
  const topCat = metrics.top_categories[0]?.name ?? 'general spending'
  const symbol = currencySymbol(metrics.currency)
  const div = metrics.currency === 'JPY' ? 1 : 100
  let summary = `Your week in review: you spent ${symbol}${(metrics.spend_total / div).toLocaleString()} primarily on ${topCat}, earned ${symbol}${(metrics.income_total / div).toLocaleString()}, and worked through ${metrics.tasks_completed} completed tasks while creating ${metrics.tasks_created} new ones.`

  if (metrics.learnings_added > 0 || metrics.notes_added > 0) {
    const learningPart = metrics.learnings_added > 0 ? ` You logged ${metrics.learnings_added} learning${metrics.learnings_added === 1 ? '' : 's'}${metrics.top_learning_tags.length ? ` on ${metrics.top_learning_tags.slice(0, 2).join(', ')}` : ''}.` : ''
    const notesPart = metrics.notes_added > 0 ? ` You captured ${metrics.notes_added} note${metrics.notes_added === 1 ? '' : 's'}.` : ''
    summary += learningPart + notesPart
  }

  if ((metrics.owed_total ?? 0) > 0) {
    summary += ` Friends still owe you ${symbol}${((metrics.owed_total ?? 0) / div).toLocaleString()} for shared expenses.`
  }

  return summary
}

export async function writeDigestNarrative({
  client,
  metrics,
  weekLabel,
}: {
  client: Groq
  metrics: DigestMetrics
  weekLabel: string
}): Promise<string> {
  const systemPrompt = buildDigestSystemPrompt({ weekLabel })
  const userMessage = JSON.stringify(metrics)

  const completion = await client.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    temperature: 0.3,
    max_tokens: 512,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  })

  const text = completion.choices?.[0]?.message?.content ?? ''
  return text.slice(0, 2000)
}
