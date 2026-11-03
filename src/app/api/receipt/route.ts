import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { D1Database, R2Bucket } from '@cloudflare/workers-types'
import { getSession } from '@/lib/auth'
import { createDb } from '@/lib/db'
import { captureCategories } from '@/lib/capture-categories'
import { makeGroqClient } from '@/lib/agents/llm-client'
import { parseReceiptImage } from '@/lib/agents/receipt-agent'

export const dynamic = 'force-dynamic'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
const MAX_SIZE = 3_145_728 // 3 MB (base64 limit is 4 MB; inflates 4/3)

async function loadUserPrefs(db: ReturnType<typeof createDb>, userId: string) {
  const row = await db
    .selectFrom('user_prefs')
    .where('user_id', '=', userId)
    .selectAll()
    .executeTakeFirst()
  return {
    primary_currency: row?.primary_currency ?? 'INR',
    tz: row?.tz ?? 'Asia/Kolkata',
  }
}

function extensionForMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
  }
  return map[mime] ?? 'jpg'
}

// FIX 1: Chunked base64 encoder to avoid stack overflow
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export async function POST(req: Request) {
  const session = await getSession(req)
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const userId = session.user.id

  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 })
  const image = formData.get('image')
  if (!(image instanceof Blob)) return NextResponse.json({ error: 'image blob missing' }, { status: 400 })

  if (image.size > MAX_SIZE) return NextResponse.json({ error: 'image too large' }, { status: 413 })
  if (!ALLOWED_TYPES.has(image.type)) return NextResponse.json({ error: 'unsupported content type' }, { status: 415 })

  const { env } = getCloudflareContext()
  const cfEnv = env as { DB: D1Database; RECEIPTS: R2Bucket; GROQ_API_KEY?: string }
  if (!cfEnv.GROQ_API_KEY) return NextResponse.json({ error: 'groq_not_configured' }, { status: 500 })
  const groq = makeGroqClient(cfEnv.GROQ_API_KEY)

  const db = createDb(cfEnv.DB)
  const prefs = await loadUserPrefs(db, userId)

  // Fetch categories
  // One live category per name and kind, chosen the same way every time
  // (see capture-categories.ts), so the AI's pick always maps to the same id.
  const cats = captureCategories(await db
    .selectFrom('categories')
    .where('user_id', '=', userId)
    .where('is_archived', '=', 0)
    .where('deleted_at', 'is', null)
    .select(['id', 'name', 'kind', 'created_at'])
    .execute(), userId)

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (event: object) => controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`))

      let receiptKey: string | null = null

      try {
        send({ step: 'uploading' })

        // R2 put FIRST
        const ext = extensionForMime(image.type)
        receiptKey = `${userId}/${crypto.randomUUID()}.${ext}`
        const buffer = await image.arrayBuffer()
        await cfEnv.RECEIPTS.put(receiptKey, buffer, {
          httpMetadata: { contentType: image.type },
        })

        send({ step: 'parsing' })

        // FIX 1: Use chunked base64 encoder
        const base64String = bufferToBase64(buffer)

        const visionResult = await parseReceiptImage({
          client: groq,
          imageBase64: base64String,
          mime: image.type,
          categories: cats.map(c => ({ name: c.name, kind: c.kind as 'spend' | 'income' })),
          nowIso: new Date().toISOString(),
          userTz: prefs.tz,
          defaultCurrency: prefs.primary_currency,
        })

        const matchedCat = cats.find(
          c => c.name === visionResult.category_name && c.kind === 'spend',
        )

        send({
          step: 'payload',
          payload: {
            kind: 'money',
            amount: visionResult.amount,
            currency: visionResult.currency,
            direction: visionResult.direction,
            category_id: matchedCat?.id ?? null,
            description: visionResult.description,
            occurred_at: visionResult.occurred_at,
            source: 'receipt',
            receipt_key: receiptKey,
            raw_input: `<receipt> ${visionResult.description ?? ''}`,
          },
        })
      } catch (err) {
        send({
          step: 'error',
          message: (err as Error).message,
          ...(receiptKey && { receipt_key: receiptKey }),
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    },
  })
}
