export interface MagicLinkEmail {
  subject: string
  html: string
  text: string
}

export function buildMagicLinkEmail(url: string): MagicLinkEmail {
  const subject = 'Your Lifeloom sign-in link'
  const text = `Sign in to Lifeloom:\n${url}\n\nThis link expires shortly. If you didn't request it, ignore this email.`
  const origin = new URL(url).origin
  // Quiet ledger look: off-white ground, green-black ink, flat ink button. Inline styles only,
  // and a system font stack, because mail clients drop stylesheets and web fonts.
  const html = `<!doctype html><html><body style="margin:0;background:#F2F3EE;color:#10261F;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:32px 24px">
  <div style="max-width:440px;margin:0 auto">
  <img src="${origin}/icons/icon-192.png" alt="Lifeloom" width="48" height="48" style="display:block;margin:0 0 24px;border-radius:12px"/>
  <h1 style="font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;margin:0 0 8px;color:#10261F">Sign in to Lifeloom</h1>
  <p style="font-size:15px;line-height:1.5;color:#54605A;margin:0 0 24px">Tap the button to sign in. This link expires shortly.</p>
  <a href="${url}" style="display:inline-block;background:#10261F;color:#F2F3EE;font-size:15px;font-weight:600;text-decoration:none;padding:14px 22px;border-radius:12px">Sign in to Lifeloom</a>
  <p style="font-size:13px;line-height:1.5;color:#54605A;margin:28px 0 0;padding-top:16px;border-top:1px solid #E1E4DB">If you didn't request this, you can ignore this email.</p>
  </div>
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
