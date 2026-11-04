import { test } from 'node:test'
import assert from 'node:assert/strict'
import { order } from '../../hooks/deck/order.ts'
import { canAnswer } from '../../hooks/deck/gate.ts'
import type { Card, Kind } from '../../hooks/deck/types.ts'

const card = (id: string, kind: Kind, at: string, extra: Partial<Card> = {}): Card => ({
  id, title: id, isRunning: false, prNumber: null, prState: null, lastActivityAt: at,
  kind, ask: 'Which colour?', extra: 0, replyHash: '0', ...extra,
})

test('needs-you oldest first, then unclear, busy, done, quiet', () => {
  const ids = order([
    card('q', 'quiet', '2026-11-04T05:00:00Z'),
    card('n2', 'needs-you', '2026-11-04T04:00:00Z'),
    card('b', 'busy', '2026-11-04T05:00:00Z'),
    card('u', 'unclear', '2026-11-04T05:00:00Z'),
    card('n1', 'needs-you', '2026-11-04T03:00:00Z'),
    card('d', 'done', '2026-11-04T05:00:00Z'),
  ], null).map(c => c.id)
  assert.deepEqual(ids, ['n1', 'n2', 'u', 'b', 'd', 'q'])
})

test('a frozen order holds, new ids go last, gone ids drop', () => {
  const ids = order([card('a', 'quiet', 'x'), card('b', 'needs-you', 'x'), card('c', 'busy', 'x')], ['a', 'gone', 'b']).map(c => c.id)
  assert.deepEqual(ids, ['a', 'b', 'c'])
})

test('answer gate: questions only, no approvals, no open PR', () => {
  assert.equal(canAnswer(card('a', 'needs-you', 'x')), true)
  for (const ask of ['Merge it?', 'Ready to ship?', 'Adopt live?', 'OK to push?', 'Approve the plan?', 'Pick one'])
    assert.equal(canAnswer(card('a', 'needs-you', 'x', { ask })), false, ask)
  assert.equal(canAnswer(card('a', 'needs-you', 'x', { prNumber: 4, prState: 'OPEN' })), false)
  assert.equal(canAnswer(card('a', 'needs-you', 'x', { prNumber: 4, prState: 'MERGED' })), true)
  assert.equal(canAnswer(card('a', 'needs-you', 'x', { ask: 'Keep liveliness?' })), true)
  assert.equal(canAnswer(card('a', 'quiet', 'x')), false)
})
