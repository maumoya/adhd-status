// Which cards may be answered from the deck. An allow-list: anything unsure gets Open only.
import type { Card } from './types.ts'

const APPROVAL = /\b(merge|adopt|deploy|install|approve|release|push|ship|live)\b/i

export function canAnswer(c: Card): boolean {
  return c.kind === 'needs-you' && c.ask.trim().endsWith('?') && !APPROVAL.test(c.ask) && c.prState !== 'OPEN'
}
