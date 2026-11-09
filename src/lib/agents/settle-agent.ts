import type Groq from 'groq-sdk'
import { callGroqJSON, withRetry } from './llm-client'
import { buildSettleAgentSystemPrompt } from './prompts/settle-agent'
import { SettleAgentResponseSchema, type SettleAgentResponse } from './schemas/settle-agent-response'

type Args = {
  client: Groq
  text: string
  people: Array<{ name: string }>
  defaultCurrency: string
}

/** "Arun paid me 10000" → { person_name, amount, currency }. */
export async function parseSettlement({ client, text, people, defaultCurrency }: Args): Promise<SettleAgentResponse> {
  const raw = await withRetry(
    () => callGroqJSON<unknown>({
      client,
      model: 'openai/gpt-oss-120b',
      system: buildSettleAgentSystemPrompt(people.map(p => p.name), defaultCurrency),
      user: text,
      temperature: 0,
      maxTokens: 128,
    }),
    { attempts: 3, baseMs: 500 },
  )
  const parsed = SettleAgentResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`settle_agent: invalid response — ${parsed.error.message}\nRaw: ${JSON.stringify(raw)}`)
  }
  return parsed.data
}
