import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ago, bar, burst, check, chips, counts, countsAlt, isNew, layout, markNew, noteLook, pulse, rise, ring,
  settleNotes, spinner, NEW_MS, tileGrid, statusTone, pickFocus, cut,
} from '../../hooks/deck/look.ts'
import type { Card, Kind } from '../../hooks/deck/types.ts'

const card = (id: string, kind: Kind, extra: Partial<Card> = {}): Card => ({
  id, title: id, isRunning: false, prNumber: null, prState: null, lastActivityAt: 'x',
  kind, ask: '', extra: 0, replyHash: 'h0', ...extra,
})

test('counts, chips and the bar alt read the same numbers', () => {
  const c = counts([card('a', 'needs-you'), card('b', 'needs-you'), card('c', 'busy'), card('d', 'quiet')])
  assert.deepEqual(c, { 'needs-you': 2, unclear: 0, busy: 1, done: 0, quiet: 1 })
  assert.deepEqual(chips(c).map(x => x.text), ['2 NEED YOU', '1 RUNNING', '1 QUIET'])
  assert.equal(countsAlt(c), '2 need you, 1 running, 1 quiet')
  assert.deepEqual(chips(counts([card('a', 'needs-you')])).map(x => x.text), ['1 NEEDS YOU'])
  assert.equal(countsAlt(counts([card('a', 'needs-you')])), '1 needs you')
  assert.equal(countsAlt(counts([])), 'No threads')
})

test('rise counts only new needs-you, and nothing before a first poll', () => {
  const one = counts([card('a', 'needs-you')])
  const three = counts([card('a', 'needs-you'), card('b', 'needs-you'), card('c', 'needs-you')])
  assert.equal(rise(one, three), 2)
  assert.equal(rise(three, one), 0)
  assert.equal(rise(null, three), 0)
})

test('the bar splits its width by share, with 2 px gaps', () => {
  const l = layout(counts([card('a', 'needs-you'), card('b', 'done'), card('c', 'done'), card('d', 'done')]), 102)
  assert.deepEqual(l['needs-you'], { x: 0, w: 25 })
  assert.deepEqual(l.done, { x: 27, w: 75 })
  assert.equal(l.busy.w, 0)
  assert.equal(layout(counts([]), 280)['needs-you'].w, 0)
})

test('the bar slides from the last counts and pulses only while someone needs you', () => {
  const before = counts([card('a', 'busy')])
  const after = counts([card('a', 'needs-you')])
  const s = bar(before, after, 100)
  assert.match(s, /^<svg [^>]*viewBox="0 0 100 8"/)
  assert.match(s, /fill="#E8A33D"><animate attributeName="x" values="0;0"[^>]*\/><animate attributeName="width" values="0;100"/)
  assert.match(s, /fill="#4C8DF6"><animate attributeName="x"[^>]*\/><animate attributeName="width" values="100;0"/)
  assert.match(s, /repeatCount="indefinite"/)
  assert.doesNotMatch(bar(null, before, 100), /repeatCount/)
  // First poll grows in from nothing.
  assert.match(bar(null, before, 100), /attributeName="width" values="0;100"/)
})

test('every drawing is fixed shapes, hex and numbers only', () => {
  const all = [bar(null, counts([card('a', 'unclear')])), ring(1_762_000_000_123), pulse(), spinner(), burst(), check()]
  for (const s of all) {
    assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    assert.doesNotMatch(s, /<script|on[a-z]+=|href|<text|<foreignObject|url\((?!#r\))/i)
  }
  // A new poll stamp gives the ring a new source, so it restarts.
  assert.notEqual(ring(1), ring(2))
  assert.match(ring(Number.NaN), /data-poll="0"/)
})

test('NEW marks a card that became needs-you, not one that always was, and never on the first poll', () => {
  const prev = [card('a', 'quiet'), card('b', 'needs-you')]
  const next = [card('a', 'needs-you'), card('b', 'needs-you'), card('c', 'needs-you'), card('d', 'busy')]
  const m = markNew(prev, next, { b: 0 }, 1000, false)
  assert.deepEqual(m, { a: 1000, b: 0, c: 1000 })
  assert.deepEqual(markNew([], next, {}, 1000, true), { a: 0, b: 0, c: 0 })
  // Kept while it stays needs-you, dropped once it leaves.
  assert.deepEqual(markNew(next, [card('a', 'needs-you')], m, 5000, false), { a: 1000 })
  assert.equal(isNew(1000, 1000 + NEW_MS - 1), true)
  assert.equal(isNew(1000, 1000 + NEW_MS), false)
  assert.equal(isNew(0, 1), false)
  assert.equal(isNew(undefined, 1), false)
})

test('a note stays through the poll that first sees it and clears when the reply changes', () => {
  const notes = { a: 'Sent · m42', b: 'Not sent' }
  const one = settleNotes(notes, {}, [card('a', 'busy', { replyHash: 'h1' }), card('b', 'needs-you')])
  assert.deepEqual(one, { notes, seen: { a: 'h1', b: 'h0' } })
  const two = settleNotes(one.notes, one.seen, [card('a', 'needs-you', { replyHash: 'h2' }), card('b', 'needs-you')])
  assert.deepEqual(two, { notes: { b: 'Not sent' }, seen: { b: 'h0' } })
  // A note for a thread no longer listed is kept, unmarked.
  assert.deepEqual(settleNotes({ z: 'Not sent' }, {}, []), { notes: { z: 'Not sent' }, seen: {} })
})

test('note looks follow the fixed send words', () => {
  assert.deepEqual(noteLook('Sent · m42'), { tone: 'success', glyph: '✓' })
  assert.equal(noteLook('Not sent').tone, 'subtle')
  assert.equal(noteLook('Changed — refreshed').glyph, '↻')
  assert.equal(noteLook('Busy — try when idle').tone, 'warning')
  assert.equal(noteLook('Unknown — open the thread').tone, 'error')
  assert.equal(noteLook('Click "Unknown thing" in the sidebar').tone, 'subtle')
})

test('ago reads seconds, minutes, hours, days', () => {
  assert.equal(ago(0, 4_000), '4s')
  assert.equal(ago(0, 120_000), '2m')
  assert.equal(ago(0, 7_200_000), '2h')
  assert.equal(ago(0, 172_800_000), '2d')
  assert.equal(ago(5_000, 0), '0s')
})

test('tileGrid fits 3 to 5 tiles on a wide window and one on a narrow one', () => {
  assert.deepEqual(tileGrid(40), { perRow: 1, width: 38 })
  assert.equal(tileGrid(100).perRow, 3)
  assert.equal(tileGrid(200).perRow, 5)
  assert.equal(tileGrid(400).perRow, 5)
  const g = tileGrid(130)
  assert.ok(g.perRow * g.width + (g.perRow - 1) <= 128)
  assert.equal(tileGrid(Number.NaN).perRow, 2)
})

test('statusTone colours the status emoji', () => {
  assert.equal(statusTone('👉 you: pick'), 'warning')
  assert.equal(statusTone('✅ done'), 'success')
  assert.equal(statusTone('❌ failed'), 'error')
  assert.equal(statusTone('⏳ running'), 'suggestion')
  assert.equal(statusTone('later'), 'text')
})

test('pickFocus keeps a listed choice, else the oldest needs-you, never a quiet one', () => {
  const a = card('a', 'needs-you', { lastActivityAt: '2026-11-04T05:00:00Z' })
  const b = card('b', 'needs-you', { lastActivityAt: '2026-11-04T04:00:00Z' })
  const q = card('q', 'quiet')
  const r = card('r', 'busy')
  assert.equal(pickFocus([a, b, q], 'a')?.id, 'a')
  assert.equal(pickFocus([a, b, q], null)?.id, 'b')
  assert.equal(pickFocus([a, b, q], 'gone')?.id, 'b')
  assert.equal(pickFocus([a, b, q], 'q')?.id, 'b')
  assert.equal(pickFocus([q, r], null)?.id, 'r')
  assert.equal(pickFocus([q], null), null)
})

test('pickFocus hands the top to the next thread after one is answered, until it moves again', () => {
  const a = card('a', 'needs-you', { lastActivityAt: '2026-11-04T05:00:00Z' })
  const b = card('b', 'needs-you', { lastActivityAt: '2026-11-04T04:00:00Z' })
  assert.equal(pickFocus([a, b], null, { b: b.lastActivityAt })?.id, 'a')
  assert.equal(pickFocus([a, b], null, { b: '2026-11-04T03:00:00Z' })?.id, 'b')
  assert.equal(pickFocus([a, b], 'b', { b: b.lastActivityAt })?.id, 'b')
  assert.equal(pickFocus([b], null, { b: b.lastActivityAt })?.id, 'b')
})

test('cut ends a long text with an ellipsis', () => {
  assert.equal(cut('short', 10), 'short')
  assert.equal(cut('abcdefghij', 5), 'abcd…')
})
