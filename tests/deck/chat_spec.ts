import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chat, fit, lastExchange, safeMd } from '../../hooks/deck/chat.ts'
import { canMessage } from '../../hooks/deck/gate.ts'
import type { Card } from '../../hooks/deck/types.ts'

const EV = 'Session "T" (idle) — showing 5 of 9 messages\n\n[user] status please\n\n[assistant] (called Bash)\n(called Read)\n\n[assistant] (called Bash)\n\n[assistant] | Task | Why | Status |\nline two\n\n[result] done (success), 3 turns\n'

test('chat keeps user and assistant turns in order and folds tool runs', () => {
  assert.deepEqual(chat(EV), [
    { role: 'user', text: 'status please' },
    { role: 'tool', text: 'Bash, Read' },
    { role: 'assistant', text: '| Task | Why | Status |\nline two' },
  ])
  assert.deepEqual(chat(null), [])
})

test('safeMd leaves nothing pressable', () => {
  const s = safeMd('see [the PR](https://evil.example/x) and ![i](https://x/i.png) <a href="https://x">a</a> https://bare.example/p `https://kept.example`\n[r]: https://ref.example')
  assert.doesNotMatch(s, /\]\(|<a|href/)
  assert.match(s, /see the PR and i a `https:\/\/bare\.example\/p` `https:\/\/kept\.example`/)
  assert.doesNotMatch(s, /ref\.example/)
})

test('fit keeps the newest messages and cuts the oldest kept one', () => {
  const msgs = Array.from({ length: 10 }, (_, i) => ({ role: 'user' as const, text: `m${i}` }))
  const got = fit(msgs, 6, 80)
  assert.deepEqual(got.map(m => m.text), ['m7', 'm8', 'm9'])
  const long = fit([{ role: 'assistant', text: 'a\nb\nc\nd\ne\nf\ng' }], 5, 80)
  assert.equal(long.length, 1)
  assert.match(long[0].text, /^…\n.*g$/s)
})

const C: Card = { id: 'local_x', title: 'T', isRunning: false, prNumber: null, prState: null, lastActivityAt: '', kind: 'quiet', ask: 'Docs — ⏸ waits', extra: 0, replyHash: '' }

test('canMessage blocks approval words and a bare yes to an approval ask', () => {
  assert.equal(canMessage(C, 'please add a dark theme'), true)
  assert.equal(canMessage(C, 'yes'), true)
  assert.equal(canMessage(C, 'merge it'), false)
  assert.equal(canMessage({ ...C, ask: 'PR — 👉 you: merge it' }, 'yes'), false)
  assert.equal(canMessage({ ...C, prState: 'OPEN' }, 'ok!'), false)
  assert.equal(canMessage({ ...C, prState: 'OPEN' }, 'what does the PR change?'), true)
  assert.equal(canMessage(C, '   '), false)
})

test('lastExchange is the latest reply whole and the owner message before it', () => {
  const m = chat('[user] first\n[assistant] old\n[user] pick blue\n[assistant] (called Bash)\n[assistant] | A | B |\n|---|---|\n| 1 | 2 |\n[result] done')
  assert.deepEqual(lastExchange(m), { you: 'pick blue', reply: '| A | B |\n|---|---|\n| 1 | 2 |' })
  assert.deepEqual(lastExchange(chat('[user] hi')), { you: null, reply: null })
  assert.deepEqual(lastExchange(chat('[assistant] hello')), { you: null, reply: 'hello' })
})
