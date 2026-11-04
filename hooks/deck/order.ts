// Card order: what needs the owner first. Pure: no `$`.
import type { Card, Kind } from './types.ts'

const RANK: Record<Kind, number> = { 'needs-you': 0, unclear: 1, busy: 2, done: 3, quiet: 4 }

export function order(cards: Card[], frozen: string[] | null): Card[] {
  if (frozen !== null) {
    const byId = new Map(cards.map(c => [c.id, c]))
    const kept = frozen.flatMap(id => byId.get(id) ?? [])
    return [...kept, ...cards.filter(c => !frozen.includes(c.id))]
  }
  return [...cards].sort((a, b) => {
    if (RANK[a.kind] !== RANK[b.kind]) return RANK[a.kind] - RANK[b.kind]
    // The longest wait first for asks; the freshest first elsewhere.
    const at = a.lastActivityAt.localeCompare(b.lastActivityAt)
    return a.kind === 'needs-you' ? at : -at
  })
}
