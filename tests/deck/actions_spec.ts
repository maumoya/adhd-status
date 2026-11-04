import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bashBlock, detail, pickList, ranked, recommended, runMessage } from '../../hooks/deck/actions.ts'
import { canAct, canAnswer } from '../../hooks/deck/gate.ts'
import { recheck, recheckWith, snap } from '../../hooks/deck/guard.ts'
import { hash, lastReply } from '../../hooks/deck/parse.ts'
import type { Card } from '../../hooks/deck/types.ts'

const TABLE = '| Task | Why | Status |\n|---|---|---|\n| Colours | look right | 👉 you: pick |'
const ev = (reply: string) => `[assistant] ${reply}`
const card = (extra: Partial<Card> = {}): Card => ({
  id: 'local_aaaaaa111111', title: 'Colours', isRunning: false, prNumber: null, prState: null,
  lastActivityAt: 't', kind: 'needs-you', ask: 'Colours — 👉 you: pick', extra: 0, replyHash: 'h', ...extra,
})

test('pickList reads 1..4 in order, allows blank lines, stops at other text', () => {
  assert.deepEqual(pickList(['1. A', '', '2) B', '3. C', 'tail', '4. D']), ['A', 'B', 'C'])
  assert.deepEqual(pickList(['2. B', '1. A']), ['A'])
  assert.deepEqual(pickList(['1. a', '2. b', '3. c', '4. d', '5. e']), ['a', 'b', 'c', 'd'])
  assert.deepEqual(pickList(['1. tab\there', '2. ' + 'x'.repeat(400)]).map(s => s.length), [8, 300])
  assert.deepEqual(pickList(['no list']), [])
})

test('recommended is the marked option, else the first', () => {
  assert.equal(recommended(['a', 'b (Recommended)']), 1)
  assert.equal(recommended(['a', 'b']), 0)
  assert.deepEqual(ranked({ options: ['a', 'b', 'c'], recommended: 2 }).map(o => o.i), [2, 0, 1])
})

test('bashBlock takes the first closed bash fence only', () => {
  assert.equal(bashBlock(['```bash', '  npm test  ', '```']), 'npm test')
  assert.equal(bashBlock(['```js', 'x', '```', '```sh', 'ls', '```']), 'ls')
  assert.equal(bashBlock(['```bash', 'never closed']), '')
})

test('detail looks only after the last status table and matches the card reply hash', () => {
  const reply = '1. Before table\n```bash\nrm -rf x\n```\n' + TABLE + '\n\n1. Red\n2. Blue (Recommended)\n\n```bash\nnpm test\n```'
  const d = detail(ev(reply))
  assert.equal(d.replyHash, hash(lastReply(ev(reply)) ?? ''))
  assert.deepEqual(d.rows, [{ task: 'Colours', why: 'look right', status: '👉 you: pick' }])
  assert.deepEqual(d.options, ['Red', 'Blue (Recommended)'])
  assert.equal(d.recommended, 1)
  assert.equal(d.command, 'npm test')
  assert.deepEqual(detail(ev('no table\n1. A')).options, [])
  assert.deepEqual(detail(null).rows, [])
})

test('runMessage asks the thread and never carries more than 60 plain characters', () => {
  assert.equal(runMessage('npm test'), 'Please run the command from your last reply yourself (it starts with: npm test).')
  const m = runMessage('echo ' + 'y'.repeat(200))
  assert.ok(m.length < 140)
})

test('canAct blocks approval words in the text or ask, an open PR, and non needs-you', () => {
  assert.equal(canAct(card(), 'Blue'), true)
  assert.equal(canAct(card(), 'Merge it now'), false)
  assert.equal(canAct(card(), 'git push'), false)
  assert.equal(canAct(card({ ask: 'release it?' }), 'Blue'), false)
  assert.equal(canAct(card({ prState: 'OPEN' }), 'Blue'), false)
  assert.equal(canAct(card({ kind: 'unclear' }), 'Blue'), false)
  assert.equal(canAct(card(), '  '), false)
  // The Answer gate is unchanged: it still needs a question mark.
  assert.equal(canAnswer(card()), false)
  assert.equal(canAnswer(card({ ask: 'which colour?' })), true)
})

test('recheckWith uses its gate; recheck still uses canAnswer', () => {
  const c = card()
  const allow = (x: Card) => canAct(x, 'Blue')
  assert.equal(recheckWith(snap(c), c, allow), 'ok')
  assert.equal(recheck(snap(c), c), 'changed')
  assert.equal(recheckWith(snap(c), { ...c, replyHash: 'other' }, allow), 'changed')
  assert.equal(recheckWith(snap(c), { ...c, isRunning: true }, allow), 'busy')
})
