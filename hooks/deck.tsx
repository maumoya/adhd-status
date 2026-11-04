import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Card, Thread } from './deck/types.ts'
import { toCard } from './deck/parse.ts'
import { order } from './deck/order.ts'
import { canAnswer } from './deck/gate.ts'
import { snap, recheck, compose, readResult, confirmText } from './deck/guard.ts'

// The thread deck: one pane with every thread's next step for the owner.
// Opens only on /deck. Reads the desktop app's session tools; nothing leaves the Mac.
const PANE = 'thread-deck'
const SM = 'ccd_session_mgmt'
const POLL_MS = 10_000
const STALE_MS = 60_000
const IDLE_MS = 600_000

const cards = atom({ plugin: 'adhd-status', key: 'cards' }, [] as Card[], { shape: 'cards-1' })
const polledAt = atom({ plugin: 'adhd-status', key: 'polledAt' }, 0, { shape: 'n-1' })
const pollError = atom({ plugin: 'adhd-status', key: 'pollError' }, '', { shape: 's-1' })
const frozen = atom({ plugin: 'adhd-status', key: 'frozen' }, null as string[] | null, { shape: 'ids-1' })
const drafts = atom({ plugin: 'adhd-status', key: 'drafts' }, {} as Record<string, string>, { shape: 'map-1' })
const sending = atom({ plugin: 'adhd-status', key: 'sending' }, null as string | null, { shape: 'id-1' })
const notes = atom({ plugin: 'adhd-status', key: 'notes' }, {} as Record<string, string>, { shape: 'map-1' })
const answered = atom({ plugin: 'adhd-status', key: 'answered' }, {} as Record<string, string>, { shape: 'map-1' })
const lastInput = atom({ plugin: 'adhd-status', key: 'lastInput' }, 0, { shape: 'n-1' })
const paused = atom({ plugin: 'adhd-status', key: 'paused' }, false, { shape: 'b-1' })

type Raw = { sessionId: string; title?: string; isRunning?: boolean; isArchived?: boolean; prNumber?: number; prState?: string; lastActivityAt?: string }

const text = (r: { content?: Array<{ type: string; text?: string }>; isError?: boolean }) => {
  const t = (r.content ?? []).map(c => c.text ?? '').join('\n')
  if (r.isError) throw new Error(t || 'tool error')
  return t
}

const toThread = (s: Raw): Thread => ({
  id: s.sessionId, title: s.title ?? '(untitled)', isRunning: s.isRunning === true,
  prNumber: s.prNumber ?? null, prState: s.prState ?? null, lastActivityAt: s.lastActivityAt ?? '',
})

async function events($: any, id: string): Promise<string | null> {
  try { return text(await $.mcp.call(SM, 'list_events', { session_id: id, limit: 12 })) } catch { return null }
}

// One thread, read fresh: what the send guard compares against.
async function reread($: any, id: string): Promise<Card | null> {
  const list: Raw[] = JSON.parse(text(await $.mcp.call(SM, 'list_sessions', { limit: 20 })))
  const s = list.find(x => x.sessionId === id)
  return s ? toCard(toThread(s), await events($, id)) : null
}

async function poll($: any): Promise<void> {
  if (await read($, paused)) return
  if (Date.now() - (await read($, lastInput)) > IDLE_MS) { await update($, paused, () => true); return }
  let list: Raw[]
  try {
    list = JSON.parse(text(await $.mcp.call(SM, 'list_sessions', { limit: 20 })))
    if (!Array.isArray(list)) throw new Error('list_sessions: not a list')
  } catch (x) {
    await update($, pollError, () => String((x as Error).message ?? x))
    return
  }
  const old = new Map((await read($, cards)).map(c => [c.id, c]))
  const next: Card[] = []
  for (const s of list.filter(s => !s.isArchived)) {
    const t = toThread(s)
    const prev = old.get(t.id)
    // Only threads with new activity are re-read; the rest keep their card.
    if (prev && prev.lastActivityAt === t.lastActivityAt && prev.kind !== 'unclear') {
      next.push({ ...prev, ...t, kind: t.isRunning ? 'busy' : prev.kind === 'busy' ? toCard(t, null).kind : prev.kind })
      continue
    }
    next.push(toCard(t, await events($, t.id)))
  }
  await update($, cards, () => next)
  await update($, pollError, () => '')
  await update($, polledAt, () => Date.now())
}

// Set before the first await, so two presses at once cannot both pass.
let inFlight = false

async function send($: any, id: string, body: string): Promise<void> {
  if (inFlight || body.trim() === '') return
  inFlight = true
  try { await sendOnce($, id, body) } finally { inFlight = false }
}

async function sendOnce($: any, id: string, body: string): Promise<void> {
  const card = (await read($, cards)).find(c => c.id === id)
  if (!card || !canAnswer(card)) return
  // One answer per ask: a second Enter on the same, unchanged ask sends nothing.
  if ((await read($, answered))[id] === JSON.stringify(snap(card))) return
  await update($, sending, () => id)
  const note = (s: string) => update($, notes, n => ({ ...n, [id]: s }))
  try {
    const before = snap(card)
    const message = compose(body, card)
    let yes = ''
    try { yes = await $.ui.ask(confirmText(card, message), ['Send', 'Cancel']) } catch { yes = '' }
    if (yes !== 'Send') { await note('Not sent'); return }
    const now = await reread($, id)
    const check = now ? recheck(before, now) : 'changed'
    if (check !== 'ok') {
      await note(check === 'busy' ? 'Busy — try when idle' : 'Changed — refreshed')
      await poll($)
      return
    }
    let r: string | Error
    try { r = text(await $.mcp.call(SM, 'send_message', { session_id: id, message })) } catch (x) { r = x as Error }
    const sent = readResult(r)
    await note(sent.state === 'sent' ? `Sent · ${sent.messageId}` : 'Unknown — open the thread')
    await update($, answered, a => ({ ...a, [id]: JSON.stringify(before) }))
    if (sent.state === 'sent') await update($, drafts, d => ({ ...d, [id]: '' }))
  } finally {
    await update($, sending, () => null)
    await update($, frozen, () => null)
  }
}

const age = (iso: string, now: number) => {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  return Number.isNaN(m) ? '?' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`
}
const clock = (ms: number) => (ms ? new Date(ms).toTimeString().slice(0, 8) : 'never')

export const register: Register = on => {
  let timer: { cancel: () => void } | null = null
  const stop = () => { timer?.cancel(); timer = null }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'deck', description: "Open the thread deck: every thread's next step in one pane" })
    return next(e)
  })

  on('command.run', { command: 'deck' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Thread deck' })
    await update($, lastInput, () => Date.now())
    await update($, paused, () => false)
    if (!timer) timer = $.clock.every(POLL_MS, () => { void poll($) })
    await poll($)
    return { text: 'Thread deck opened.' }
  })

  on('ui.close', async ($, e, next) => { if ((e as { id?: string }).id === PANE) stop(); return next(e) })
  on('session.end', async ($, e, next) => { stop(); return next(e) })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const now = Date.now()
    const [list, at, err, fz, dr, busy, nt, isPaused] = await Promise.all([
      read($, cards), read($, polledAt), read($, pollError), read($, frozen),
      read($, drafts), read($, sending), read($, notes), read($, paused),
    ])
    const shown = order(list, fz)
    const stale = at > 0 && now - at > STALE_MS
    const touch = async () => {
      await update($, lastInput, () => Date.now())
      await update($, frozen, f => f ?? shown.map(c => c.id))
    }
    return (
      <Box flexDirection="column">
        <Text dimColor>Updated {clock(at)}</Text>
        {err !== '' && <Text color="red">Poll failed: {err}</Text>}
        {err === '' && stale && <Text color="red">Stale: last update over a minute ago</Text>}
        {isPaused && (
          <Box flexDirection="row">
            <Text color="red">Paused after 10 min idle </Text>
            <Button key="resume" label="Resume" onPress={async () => {
              await update($, paused, () => false)
              await update($, lastInput, () => Date.now())
              await poll($)
            }} />
          </Box>
        )}
        {shown.length === 0 && <Text dimColor>No open threads.</Text>}
        {shown.map(c => (
          <Box key={'c-' + c.id} flexDirection="column" marginTop={1}>
            <Text bold>
              [{c.kind}] {c.title} ({c.id.slice(6, 12)}){c.prNumber !== null ? ` · PR #${c.prNumber} ${c.prState ?? ''}` : ''} · {age(c.lastActivityAt, now)}
            </Text>
            {c.ask !== '' && <Text>{c.ask}{c.extra > 0 ? ` (+${c.extra})` : ''}</Text>}
            {nt[c.id] !== undefined && <Text dimColor>{nt[c.id]}</Text>}
            <Button key={'o-' + c.id} label="Open" plain onPress={() =>
              update($, notes, n => ({ ...n, [c.id]: `Click "${c.title}" in the sidebar` }))} />
            {canAnswer(c) && (
              <Input
                key={'a-' + c.id}
                label="Answer"
                placeholder="type an answer"
                submitLabel="send"
                value={dr[c.id] ?? ''}
                onInput={async (v: string) => { await touch(); await update($, drafts, d => ({ ...d, [c.id]: v })) }}
                onSubmit={async (v: string) => { if (busy === null) await send($, c.id, v) }}
              />
            )}
          </Box>
        ))}
      </Box>
    )
  })
}
