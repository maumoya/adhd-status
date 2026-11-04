// Which cards may be answered from the deck. An allow-list: anything unsure gets Open only.
import type { Card } from './types.ts'

const APPROVAL = /\b(merge|adopt|deploy|install|approve|release|push|ship|live)\b/i

export function canAnswer(c: Card): boolean {
  return c.kind === 'needs-you' && c.ask.trim().endsWith('?') && !APPROVAL.test(c.ask) && c.prState !== 'OPEN'
}

// An option or Run button: the same allow-list, with the option text or command checked too,
// so a click can never be an approval. The ask need not end in a question mark.
export function canAct(c: Card, text: string): boolean {
  return c.kind === 'needs-you' && text.trim() !== '' && !APPROVAL.test(c.ask) && !APPROVAL.test(text) && c.prState !== 'OPEN'
}

// A free message typed in the focus composer. Any thread may get one, but never approval words,
// and never a bare yes while the thread's ask is an approval or it has an open PR.
const CONSENT = /^\s*(y|yes|yep|yeah|ok|okay|sure|go|go ahead|do it|si|sí|dale|approved?|lgtm|👍|✅)\b[\s.!]*$/i

export function canMessage(c: Card, text: string): boolean {
  if (text.trim() === '' || APPROVAL.test(text)) return false
  return !(CONSENT.test(text) && (APPROVAL.test(c.ask) || c.prState === 'OPEN'))
}
