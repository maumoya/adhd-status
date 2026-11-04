import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hash, lastReply, plain, statusRows, toCard } from '../../hooks/deck/parse.ts'
import type { Thread } from '../../hooks/deck/types.ts'

const T: Thread = { id: 'local_abcdef123', title: 'T', isRunning: false, prNumber: null, prState: null, lastActivityAt: '2026-11-04T00:00:00Z' }
const HEAD = '| Task | Why | Status |\n|---|---|---|\n'
const ev = (reply: string) => `Session "T" (idle) — showing 3 of 9 messages\n\n[user] status\n\n[assistant] ${reply}\n\n[assistant] (called Bash)\n`

test('one 👉 row is needs-you with the row as ask', () => {
  const c = toCard(T, ev(HEAD + '| Merge PR | ship it | 👉 you: merge it, ~1 min |\n| Docs | read right | ✅ done |'))
  assert.equal(c.kind, 'needs-you')
  assert.equal(c.ask, 'Merge PR — 👉 you: merge it, ~1 min')
  assert.equal(c.extra, 0)
})

test('no table is unclear, never quiet', () => {
  assert.equal(toCard(T, ev('All good, nothing here.')).kind, 'unclear')
  assert.equal(toCard(T, null).kind, 'unclear')
})

test('two 👉 rows count the extra', () => {
  const c = toCard(T, ev(HEAD + '| A | a | 👉 you: pick? |\n| B | b | 👉 you: run it |'))
  assert.equal(c.extra, 1)
  assert.equal(c.ask, 'A — 👉 you: pick?')
})

test('the last table wins', () => {
  const c = toCard(T, ev(HEAD + '| Old | o | 👉 old ask |\n\nlater\n\n' + HEAD + '| New | n | ✅ done |'))
  assert.equal(c.kind, 'done')
})

test('all ✅ is done; other is quiet; running is busy', () => {
  assert.equal(toCard(T, ev(HEAD + '| A | a | ✅ live |')).kind, 'done')
  assert.equal(toCard(T, ev(HEAD + '| A | a | ⏸ waits on CI |')).kind, 'quiet')
  assert.equal(toCard({ ...T, isRunning: true }, ev(HEAD + '| A | a | 👉 you |')).kind, 'busy')
})

test('lastReply skips tool-call-only blocks', () => {
  assert.equal(lastReply(ev('hello')), 'hello')
  assert.equal(lastReply('[assistant] (called Bash)\n'), null)
})

test('statusRows is null without the header', () => {
  assert.equal(statusRows('| A | B |\n|---|---|\n| x | y |'), null)
})

test('plain strips markup and control chars and cuts', () => {
  const p = plain('see [link](http://x) `code` **b**\u0007 <i>')
  for (const ch of ['[', ']', '(', ')', '`', '*', '\u0007', '<', '>']) assert.ok(!p.includes(ch), ch)
  assert.equal(plain('a'.repeat(80), 60).length, 60)
  assert.ok(plain('a'.repeat(80), 60).endsWith('…'))
})

test('hash is stable and distinct', () => {
  assert.equal(hash('x'), hash('x'))
  assert.notEqual(hash('x'), hash('y'))
  assert.match(hash('x'), /^[0-9a-f]{8}$/)
})
