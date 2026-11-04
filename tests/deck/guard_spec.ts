import { test } from 'node:test'
import assert from 'node:assert/strict'
import { snap, recheck, compose, readResult, confirmText } from '../../hooks/deck/guard.ts'
import type { Card } from '../../hooks/deck/types.ts'

const c: Card = {
  id: 'local_abcdef123456', title: 'Colours', isRunning: false, prNumber: null, prState: null,
  lastActivityAt: '2026-11-04T05:00:00Z', kind: 'needs-you', ask: 'Colour — 👉 you: which colour?', extra: 0, replyHash: 'aa',
}

test('recheck: same snapshot is ok', () => {
  assert.equal(recheck(snap(c), c), 'ok')
})

test('recheck: new activity, new reply, PR change or new ask is changed', () => {
  for (const d of [{ lastActivityAt: 'later' }, { replyHash: 'bb' }, { prNumber: 7 }, { prState: 'MERGED' }, { ask: 'Other?' }])
    assert.equal(recheck(snap(c), { ...c, ...d }), 'changed', JSON.stringify(d))
})

test('recheck: a now-unanswerable card is changed, a running one is busy', () => {
  assert.equal(recheck(snap(c), { ...c, prState: 'OPEN', prNumber: null }), 'changed')
  assert.equal(recheck(snap(c), { ...c, isRunning: true }), 'busy')
})

test('compose adds one context line with plain, cut text', () => {
  const long = { ...c, ask: '**Which** `colour` ' + 'x'.repeat(80) + '?' }
  const out = compose('blue', long)
  const last = out.split('\n').at(-1)!
  assert.ok(out.startsWith('blue\n\n(thread deck · re: Which colour'))
  assert.ok(!/[*`]/.test(last))
  assert.ok(last.length <= '(thread deck · re: )'.length + 60)
})

test('readResult: delivered and queued are sent, else unknown', () => {
  assert.deepEqual(readResult('ok (delivery: delivered; message_id: m1)'), { state: 'sent', messageId: 'm1' })
  assert.deepEqual(readResult('x (delivery: queued; message_id: m2)'), { state: 'sent', messageId: 'm2' })
  assert.deepEqual(readResult('(delivery: failed; message_id: m3)'), { state: 'unknown' })
  assert.deepEqual(readResult('garbage'), { state: 'unknown' })
  assert.deepEqual(readResult(new Error('boom')), { state: 'unknown' })
})

test('confirmText names the thread, short id, PR and the race', () => {
  const t = confirmText({ ...c, prNumber: 9 }, 'blue')
  assert.ok(t.startsWith('Send to "Colours" (abcdef), PR 9? A turn may start before this lands.\n\nblue'))
  assert.ok(t.endsWith('?'))
  assert.ok(confirmText(c, 'x').includes('PR none'))
})
