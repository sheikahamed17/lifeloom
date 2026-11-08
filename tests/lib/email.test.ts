import { describe, it, expect, vi } from 'vitest'
import { buildMagicLinkEmail, sendMagicLinkEmail } from '@/lib/email'

describe('buildMagicLinkEmail', () => {
  it('embeds the url in both html and text and sets a subject', () => {
    const url = 'https://pulse.sdsheikahamed.workers.dev/api/auth/magic-link/verify?token=abc'
    const { subject, html, text } = buildMagicLinkEmail(url)
    expect(subject.length).toBeGreaterThan(0)
    expect(html).toContain(url)
    expect(text).toContain(url)
    // Logo is a hosted PNG whose origin is derived from the magic-link URL.
    expect(html).toContain('https://pulse.sdsheikahamed.workers.dev/icons/icon-192.png')
    expect(html).toContain('alt="Lifeloom"')
  })
})

describe('sendMagicLinkEmail', () => {
  it('POSTs to Resend with bearer auth and the from/to/subject payload', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
    await sendMagicLinkEmail({ apiKey: 'k', from: 'Lifeloom <a@b.co>', to: 'u@x.co', url: 'https://x/y', fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [u, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(u).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ from: 'Lifeloom <a@b.co>', to: 'u@x.co' })
    expect(body.subject).toBeTruthy()
  })

  it('throws on a non-2xx Resend response', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad', { status: 422 })) as unknown as typeof fetch
    await expect(sendMagicLinkEmail({ apiKey: 'k', from: 'a', to: 'b', url: 'https://x.co/verify?token=abc', fetchImpl }))
      .rejects.toThrow(/Resend send failed: 422/)
  })
})
