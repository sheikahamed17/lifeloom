export interface MagicLinkEmail {
  subject: string
  html: string
  text: string
}

export function buildMagicLinkEmail(url: string): MagicLinkEmail {
  const subject = 'Your Lifeloom sign-in link'
  const text = `Sign in to Lifeloom:\n${url}\n\nThis link expires shortly. If you didn't request it, ignore this email.`
  const origin = new URL(url).origin
  const html = `<!doctype html><html><body style="margin:0;background:#0a0b16;color:#e9ecf7;font-family:system-ui,-apple-system,sans-serif;padding:32px">
  <img src="${origin}/icons/icon-192.png" alt="Lifeloom" width="48" height="48" style="display:block;margin:0 0 16px;border-radius:12px"/>
  <h1 style="font-size:20px;margin:0 0 16px">Sign in to Lifeloom</h1>
  <p style="color:#8a90ab;margin:0 0 24px">Tap the button to sign in. This link expires shortly.</p>
  <a href="${url}" style="display:inline-block;background:linear-gradient(150deg,#6f7bff,#34e6ff);color:#0a0b16;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:12px">Sign in to Lifeloom</a>
  <p style="color:#8a90ab;font-size:12px;margin:24px 0 0">If you didn't request this, you can ignore this email.</p>
  </body></html>`
  return { subject, html, text }
}

export async function sendMagicLinkEmail(opts: {
  apiKey: string
  from: string
  to: string
  url: string
  fetchImpl?: typeof fetch
}): Promise<void> {
  const f = opts.fetchImpl ?? fetch
  const { subject, html, text } = buildMagicLinkEmail(opts.url)
  const res = await f('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: opts.from, to: opts.to, subject, html, text }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend send failed: ${res.status} ${detail}`)
  }
}
