// Send guard: bind an answer to what the owner saw, re-check before sending, read the result.
import type { Card } from './types.ts'
import { plain, hash } from './parse.ts'
import { canAnswer } from './gate.ts'

export type Snap = { id: string; prNumber: number | null; prState: string | null; askHash: string; replyHash: string; lastActivityAt: string }
export type Sent = { state: 'sent' | 'unknown'; messageId?: string }

export function snap(c: Card): Snap {
  return { id: c.id, prNumber: c.prNumber, prState: c.prState, askHash: hash(c.ask), replyHash: c.replyHash, lastActivityAt: c.lastActivityAt }
}

export function recheck(before: Snap, now: Card): 'ok' | 'changed' | 'busy' {
  return recheckWith(before, now, canAnswer)
}

// The same re-check under another gate (an option or Run button's).
export function recheckWith(before: Snap, now: Card, allowed: (c: Card) => boolean): 'ok' | 'changed' | 'busy' {
  if (now.isRunning) return 'busy'
  const same = (Object.keys(before) as (keyof Snap)[]).every(k => before[k] === snap(now)[k])
  return same && allowed(now) ? 'ok' : 'changed'
}

export function compose(text: string, c: Card): string {
  return `${text}\n\n(thread deck · re: ${plain(c.ask, 60)})`
}

export function readResult(r: string | Error): Sent {
  const m = typeof r === 'string' ? /\(delivery: (delivered|queued);\s*message_id: ([^)\s]+)\)/.exec(r) : null
  return m ? { state: 'sent', messageId: m[2] } : { state: 'unknown' }
}

export function confirmText(c: Card, body: string): string {
  return `Send to "${c.title}" (${c.id.slice(6, 12)}), PR ${c.prNumber ?? 'none'}? A turn may start before this lands.\n\n${body}\n\nSend it?`
}
