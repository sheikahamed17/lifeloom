import { formatMinor } from '@/lib/currency'

/** "−₹120" / "+₹85,000": a real minus sign (read as "minus"), minor units, JPY whole. */
export function signedAmount(minor: number, currency: string, direction: 'in' | 'out'): string {
  return `${direction === 'out' ? '−' : '+'}${formatMinor(minor, currency)}`
}

function quote(text: string, max = 40): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (t.length <= max) return `“${t}”`
  return `“${t.slice(0, max).replace(/\s+\S*$/, '')}…”`
}

export type SavedInput =
  | { kind: 'money'; amount: number; currency: string; direction: 'in' | 'out'; categoryName?: string | null; yourShare?: number | null; parts?: number }
  | { kind: 'task'; title: string }
  | { kind: 'note'; title: string | null; body: string }
  | { kind: 'learning' }
  | { kind: 'budget'; categoryName: string; amount: number; currency: string }
  | { kind: 'settle'; personName: string; amount: number; currency: string }
  | { kind: 'edit' }

/** The toast that closes the capture loop: what was saved, in the owner's words. */
export function savedLabel(s: SavedInput): string {
  switch (s.kind) {
    case 'money': {
      const amount = signedAmount(s.amount, s.currency, s.direction)
      if (s.parts && s.parts > 1) return `Saved ${amount} split ${s.parts} ways`
      const parts = [`Saved ${amount}`]
      if (s.categoryName) parts.push(s.categoryName)
      if (s.yourShare !== undefined && s.yourShare !== null) parts.push(`you ${formatMinor(s.yourShare, s.currency)}`)
      return parts.join(' · ')
    }
    case 'task': return `Task added: ${quote(s.title)}`
    case 'note': return `Note saved: ${quote(s.title || s.body)}`
    case 'learning': return 'Saved to Learn'
    case 'budget': return `Budget set: ${s.categoryName} ${formatMinor(s.amount, s.currency, 0)} a month`
    case 'settle': return `${s.personName} paid ${formatMinor(s.amount, s.currency)} · marked settled`
    case 'edit': return 'Changes saved'
  }
}
