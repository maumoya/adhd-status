import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Card, Thread } from './deck/types.ts'
import { toCard } from './deck/parse.ts'
import { order } from './deck/order.ts'
import { canAnswer, canAct, canMessage } from './deck/gate.ts'
import { chat, lastExchange, safeMd } from './deck/chat.ts'
import { snap, recheckWith, compose, readResult, confirmText } from './deck/guard.ts'
import {
  ACCENT, LABEL, ago, bar, burst, check, chips, counts, countsAlt, cut, isNew, markNew,
  noteLook, pickFocus, pulse, rise, ring, settleNotes, spinner, statusTone, tileGrid,
} from './deck/look.ts'
import { detail, ranked, runMessage } from './deck/actions.ts'
import type { Detail } from './deck/actions.ts'
import { plain } from './deck/parse.ts'
import type { Counts } from './deck/look.ts'

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
const quietOpen = atom({ plugin: 'adhd-status', key: 'quietOpen' }, false, { shape: 'b-1' })
const firstNeedsAt = atom({ plugin: 'adhd-status', key: 'firstNeedsAt' }, {} as Record<string, number>, { shape: 'nmap-1' })
const prevCounts = atom({ plugin: 'adhd-status', key: 'prevCounts' }, null as Counts | null, { shape: 'counts-1' })
const noteSeen = atom({ plugin: 'adhd-status', key: 'noteSeen' }, {} as Record<string, string>, { shape: 'map-1' })
const focusId = atom({ plugin: 'adhd-status', key: 'focusId' }, null as string | null, { shape: 'id-1' })
const details = atom({ plugin: 'adhd-status', key: 'details' }, {} as Record<string, Detail>, { shape: 'details-1' })
const deckOpen = atom({ plugin: 'adhd-status', key: 'deckOpen' }, false, { shape: 'b-1' })
const released = atom({ plugin: 'adhd-status', key: 'released' }, {} as Record<string, string>, { shape: 'map-1' })
const transcript = atom({ plugin: 'adhd-status', key: 'transcript' }, null as { id: string; at: string; events: string } | null, { shape: 'transcript-1' })

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

// The focused thread's longer transcript, re-read only when it has new activity.
async function loadChat($: any, c: Card | null): Promise<void> {
  if (c === null) return
  const t = await read($, transcript)
  if (t !== null && t.id === c.id && t.at === c.lastActivityAt) return
  let ev: string
  try { ev = text(await $.mcp.call(SM, 'list_events', { session_id: c.id, limit: 30 })) } catch { return }
  await update($, transcript, () => ({ id: c.id, at: c.lastActivityAt, events: ev }))
}

// The real thread beside the deck, where the app allows it (threads this session started); else
// the preview stays the view and the note says how to open it. Layout only: nothing is sent.
async function showThread($: any, c: Card): Promise<void> {
  let r = ''
  try { r = text(await $.mcp.call('ccd_window', 'open_session_in', { session_id: c.id, target: 'split' })) } catch (x) { r = 'refused: ' + String((x as Error).message ?? x) }
  if (/refus|not allowed|only|cannot|can't|error/i.test(r)) await update($, notes, n => ({ ...n, [c.id]: 'Live thread: drag it from the sidebar beside the deck' }))
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
  const prevList = await read($, cards)
  const old = new Map(prevList.map(c => [c.id, c]))
  const next: Card[] = []
  const oldDetails = await read($, details)
  const nextDetails: Record<string, Detail> = {}
  for (const s of list.filter(s => !s.isArchived)) {
    const t = toThread(s)
    const prev = old.get(t.id)
    // Only threads with new activity are re-read; the rest keep their card.
    if (prev && prev.lastActivityAt === t.lastActivityAt && prev.kind !== 'unclear') {
      next.push({ ...prev, ...t, kind: t.isRunning ? 'busy' : prev.kind === 'busy' ? toCard(t, null).kind : prev.kind })
      const d = oldDetails[t.id]
      if (d) nextDetails[t.id] = d
      continue
    }
    const ev = await events($, t.id)
    next.push(toCard(t, ev))
    nextDetails[t.id] = detail(ev)
  }
  // What changed since the last poll: drives the NEW mark, the bar slide and the +n.
  const first = prevList.length === 0 && (await read($, polledAt)) === 0
  const now = Date.now()
  const seen = await read($, noteSeen)
  let marks: Record<string, string> = {}
  await update($, firstNeedsAt, m => markNew(prevList, next, m, now, first))
  await update($, prevCounts, () => (first ? null : counts(prevList)))
  await update($, notes, n => { const r = settleNotes(n, seen, next); marks = r.seen; return r.notes })
  await update($, noteSeen, () => marks)
  await update($, details, () => nextDetails)
  await update($, cards, () => next)
  await update($, pollError, () => '')
  await update($, polledAt, () => Date.now())
  await loadChat($, pickFocus(order(next, await read($, frozen)), await read($, focusId), await read($, released)))
}

// Set before the first await, so two presses at once cannot both pass.
let inFlight = false

// `allowed` is the gate of the control pressed: the Answer field's, or an option or Run button's.
// `once`: one send per ask (answers and buttons); the free composer may send again.
async function send($: any, id: string, body: string, allowed: (c: Card) => boolean = canAnswer, once = true): Promise<void> {
  if (inFlight || body.trim() === '') return
  inFlight = true
  try { await sendOnce($, id, body, allowed, once) } finally { inFlight = false }
}

async function sendOnce($: any, id: string, body: string, allowed: (c: Card) => boolean, once: boolean): Promise<void> {
  const card = (await read($, cards)).find(c => c.id === id)
  if (!card || !allowed(card)) return
  // One answer per ask: a second Enter on the same, unchanged ask sends nothing.
  if (once && (await read($, answered))[id] === JSON.stringify(snap(card))) return
  await update($, sending, () => id)
  const note = (s: string) => update($, notes, n => ({ ...n, [id]: s }))
  try {
    const before = snap(card)
    const message = compose(body, card)
    let yes = ''
    try { yes = await $.ui.ask(confirmText(card, message), ['Send', 'Cancel']) } catch { yes = '' }
    if (yes !== 'Send') { await note('Not sent'); return }
    const now = await reread($, id)
    const check = now ? recheckWith(before, now, allowed) : 'changed'
    if (check !== 'ok') {
      await note(check === 'busy' ? 'Busy — try when idle' : 'Changed — refreshed')
      await poll($)
      return
    }
    let r: string | Error
    try { r = text(await $.mcp.call(SM, 'send_message', { session_id: id, message })) } catch (x) { r = x as Error }
    const sent = readResult(r)
    await note(sent.state === 'sent' ? `Sent · ${sent.messageId}` : 'Unknown — open the thread')
    if (once) await update($, answered, a => ({ ...a, [id]: JSON.stringify(before) }))
    if (sent.state === 'sent') {
      await update($, drafts, d => ({ ...d, [id]: '' }))
      // Handled: release the top so the next thread that needs you takes it.
      const at = (now ?? card).lastActivityAt
      await update($, released, r => ({ ...r, [id]: at }))
      await update($, focusId, f => (f === id ? null : f))
    }
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


const TICK = '◐◓◑◒'
const PR_KEY = (s: string | null) => (s === 'OPEN' ? 'success' : s === 'MERGED' ? 'merged' : 'subtle')

export const register: Register = on => {
  let timer: { cancel: () => void } | null = null
  const stop = () => { timer?.cancel(); timer = null }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'deck', description: "Open the thread deck: every thread's next step in one pane" })
    // A reload starts the module over: an open deck gets its refresh back.
    if (!timer && (await read($, deckOpen))) timer = $.clock.every(POLL_MS, () => { void poll($) })
    return next(e)
  })

  on('command.run', { command: 'deck' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Thread deck' })
    await update($, deckOpen, () => true)
    await update($, lastInput, () => Date.now())
    await update($, paused, () => false)
    if (!timer) timer = $.clock.every(POLL_MS, () => { void poll($) })
    await poll($)
    return { text: 'Thread deck opened.' }
  })

  on('ui.close', async ($, e, next) => { if ((e as { id?: string }).id === PANE) { stop(); await update($, deckOpen, () => false) } return next(e) })
  on('session.end', async ($, e, next) => { stop(); return next(e) })


  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e) as Record<string, any>
    const { Box, Text, Button, Markdown } = els
    // Terminal has no Svg, mobile no Input; their tables may still list one, so go by the surface too.
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : null
    const Input = e.surface !== 'mobile' && 'Input' in els ? els.Input : null
    const rich = Svg !== null
    const props = (e.props ?? {}) as { bodyColumns?: number; scroll?: { bodyRows?: number } }
    const cols = Number(props.bodyColumns) || Number(e.viewport?.columns) || 80
    const half = Math.floor((Number(props.scroll?.bodyRows) || Number(e.viewport?.rows) || 0) / 2)
    const now = Date.now()
    const [list, at, err, fz, dr, busy, nt, isPaused, qOpen, fna, prev, ans, fid, dets, tr, rel] = await Promise.all([
      read($, cards), read($, polledAt), read($, pollError), read($, frozen),
      read($, drafts), read($, sending), read($, notes), read($, paused),
      read($, quietOpen), read($, firstNeedsAt), read($, prevCounts), read($, answered),
      read($, focusId), read($, details), read($, transcript), read($, released),
    ])
    const shown = order(list, fz)
    const stale = at > 0 && now - at > STALE_MS
    const cur = counts(list)
    const up = rise(prev, cur)
    const shaky = err !== '' || stale
    const health = shaky ? 'error' : isPaused ? 'warning' : at > 0 ? 'success' : 'subtle'
    const live = shown.filter(c => c.kind !== 'quiet')
    const quiet = shown.filter(c => c.kind === 'quiet')
    const focus = pickFocus(shown, fid, rel)
    const grid = tileGrid(cols)
    const touch = async () => {
      await update($, lastInput, () => Date.now())
      await update($, frozen, f => f ?? shown.map(c => c.id))
    }
    const openNote = (c: Card) => update($, notes, n => ({ ...n, [c.id]: `Click "${c.title}" in the sidebar` }))
    const select = async (c: Card) => {
      await update($, lastInput, () => Date.now())
      await update($, focusId, () => c.id)
      void showThread($, c)
      await loadChat($, c)
    }
    // Every action goes through the one guarded send, under its own gate. Not awaited: the send
    // waits on the owner's confirm, which may outlast a hook's 10 s budget.
    const pick = (c: Card, option: string) => () => { if (busy === null) void send($, c.id, option, x => canAct(x, option)) }
    const run = (c: Card, command: string) => () => { if (busy === null) void send($, c.id, runMessage(command), x => canAct(x, command)) }

    // The parsed reply, only while it is the reply the card shows.
    const det = (c: Card): Detail | null => { const d = dets[c.id]; return d && d.replyHash === c.replyHash ? d : null }
    const look = (c: Card) => {
      const k = c.kind
      const nyou = k === 'needs-you'
      const t = nt[c.id]
      const unknown = t !== undefined && noteLook(t).tone === 'error'
      const sendingThis = busy === c.id
      const waiting = ans[c.id] === JSON.stringify(snap(c))
      return {
        k, nyou, unknown, sendingThis, waiting,
        accent: ACCENT[k],
        fresh: nyou && isNew(fna[c.id], now),
        askable: canAnswer(c),
        border: unknown ? 'error' : nyou ? 'warning' : k === 'unclear' ? 'permission' : 'subtle',
        free: !sendingThis && !waiting && !unknown,
      }
    }
    // Option and Run buttons: all options or none, so an approval among them hides the set.
    const acts = (c: Card) => {
      const d = det(c)
      if (d === null) return { opts: [] as ReturnType<typeof ranked>, cmd: '', blocked: false }
      const optsOk = d.options.length > 0 && d.options.every(o => canAct(c, o))
      const cmdOk = d.command !== '' && canAct(c, d.command)
      return {
        opts: optsOk ? ranked(d) : [],
        cmd: cmdOk ? d.command : '',
        blocked: (d.options.length > 0 && !optsOk) || (d.command !== '' && !cmdOk),
      }
    }

    const chip = (label: string, key: string) => (
      <Text size="caption" weight="semibold" color="inverseText" backgroundColor={key}>{` ${label} `}</Text>
    )
    const prChip = (c: Card) => c.prNumber === null ? null : (
      <Text size="caption" weight="semibold" color="inverseText" backgroundColor={PR_KEY(c.prState)}>
        {` PR #${c.prNumber}${c.prState ? ' ' + c.prState : ''} `}
      </Text>
    )
    const banner = (key: string, body: unknown, action?: unknown) => (
      <Box borderStyle="round" borderColor={key} paddingX="sm" paddingY="xs" flexDirection="row"
        justifyContent="space-between" alignItems="center">
        {body}
        {action ?? null}
      </Box>
    )
    const glyph = (c: Card) => {
      if (c.kind === 'busy') return rich
        ? <Svg width={12} height={12} isInteractive alt="Running" source={pulse()} />
        : <Text color="suggestion">{TICK[Math.floor(now / POLL_MS) % 4]}</Text>
      if (c.kind === 'needs-you') return <Text color="warning">●</Text>
      if (c.kind === 'done') return <Text color="success">○</Text>
      return <Text color={ACCENT[c.kind]}>◌</Text>
    }
    const noteLine = (c: Card) => {
      if (busy === c.id) return (
        <Box flexDirection="row" gap="xs" alignItems="center">
          {rich ? <Svg width={12} height={12} isInteractive alt="Sending" source={spinner()} /> : <Text color="suggestion">…</Text>}
          <Text size="footnote" color="suggestion">Sending…</Text>
        </Box>
      )
      const t = nt[c.id]
      if (t === undefined) return null
      const l = noteLook(t)
      return (
        <Box flexDirection="row" gap="xs" alignItems="center">
          <Text color={l.tone}>{l.glyph}</Text>
          <Text size="footnote" color={l.tone} wrap="truncate-end">{t}</Text>
        </Box>
      )
    }

    // A one-line row for an expanded quiet thread.
    const line = (c: Card) => (
      <Box key={'l-' + c.id} flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" paddingX="sm" gap="xs">
          <Box flexDirection="row" gap="xs" alignItems="center" flexShrink={1}>
            {glyph(c)}
            <Text size="footnote" color="inactive" dimColor={shaky} wrap="truncate-end">{c.title}</Text>
            {prChip(c)}
            <Text size="caption" color="subtle" tabular>{age(c.lastActivityAt, now)}</Text>
          </Box>
          <Button key={'o-' + c.id} plain dimColor hover={{ dimColor: false }} label="Open" onPress={() => openNote(c)} />
        </Box>
        {nt[c.id] !== undefined && <Box paddingX="sm">{noteLine(c)}</Box>}
      </Box>
    )

    // The focus view: one thread, its status rows, its ask and every action it allows.
    const focusView = (c: Card) => {
      const s = look(c)
      const d = det(c)
      const a = acts(c)
      const inner = Math.max(24, cols - 8)
      const taskW = Math.max(10, Math.floor(inner * 0.3))
      const statusW = Math.max(10, Math.floor(inner * 0.3))
      const field = s.askable && Input !== null && s.free
      // The free composer: any thread, once there is no open answer to give.
      const composer = !field && Input !== null && !s.sendingThis && !s.unknown
      const msgs = tr !== null && tr.id === c.id ? chat(tr.events) : []
      // The latest reply in full, as the thread shows it; the grid below only when there is none.
      const ex = lastExchange(msgs)
      return (
        <Box key={'c-' + c.id} flexDirection="column" borderStyle={s.fresh ? 'bold' : 'round'} borderColor={s.border}
          borderDimColor={!s.nyou && !s.unknown} paddingX="sm" paddingY="xs" gap="xs"
          hover={{ borderColor: s.border === 'subtle' ? s.accent : s.border, borderDimColor: false }}>
          <Box flexDirection="row" alignItems="center" gap="xs">
            {!rich && <Text color={s.accent}>▌</Text>}
            {glyph(c)}
            {chip(LABEL[s.k], s.accent)}
            {s.fresh && chip('NEW', 'warning')}
            {s.fresh && rich && <Svg width={12} height={12} isInteractive alt="New" source={burst()} />}
            <Text weight="semibold" size="heading" dimColor={shaky} wrap="truncate-end">{c.title}</Text>
          </Box>
          <Box flexDirection="row" gap="sm" alignItems="center">
            <Text size="caption" mono color="subtle">{c.id.slice(6, 12)}</Text>
            {prChip(c)}
            <Text size="caption" color="subtle" tabular>{age(c.lastActivityAt, now)} ago</Text>
          </Box>
          <Box display="none" hover={{ display: 'flex' }} flexDirection="row" gap="sm">
            <Text size="caption" mono color="subtle">{c.id}</Text>
            <Text size="caption" color="subtle" tabular>last activity {clock(Date.parse(c.lastActivityAt) || 0)}</Text>
          </Box>
          {ex.you !== null && (
            <Text key={'you-' + c.id} size="footnote" color="claude" wrap="truncate-end">
              {`You: ${plain(ex.you.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, ' '), inner - 6)}`}
            </Text>
          )}
          {ex.reply !== null && (Markdown
            ? <Markdown key={'reply-' + c.id} text={safeMd(ex.reply)} />
            : <Text key={'reply-' + c.id} size="footnote" wrap="wrap">{safeMd(ex.reply)}</Text>)}
          {ex.reply === null && d !== null && d.rows.length > 0 && (
            <Box flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Box width={taskW}><Text size="caption" weight="semibold" color="subtle">TASK</Text></Box>
                <Box flexGrow={1} flexShrink={1}><Text size="caption" weight="semibold" color="subtle">WHY</Text></Box>
                <Box width={statusW}><Text size="caption" weight="semibold" color="subtle">STATUS</Text></Box>
              </Box>
              {d.rows.map(r => (
                <Box flexDirection="row" gap={1}>
                  <Box width={taskW}><Text size="footnote" weight="medium" wrap="truncate-end">{r.task}</Text></Box>
                  <Box flexGrow={1} flexShrink={1}><Text size="footnote" color="subtle" wrap="truncate-end">{r.why}</Text></Box>
                  <Box width={statusW}><Text size="footnote" weight="medium" color={statusTone(r.status)} wrap="truncate-end">{r.status}</Text></Box>
                </Box>
              ))}
            </Box>
          )}
          {s.k === 'unclear' && (
            <Text size="footnote" italic color="subtle">No status table in the last reply. Open the thread.</Text>
          )}
          {s.k !== 'unclear' && c.ask !== '' && (
            <Box flexDirection="row" flexWrap="wrap">
              <Text size={s.nyou ? 'body' : 'footnote'} weight={s.nyou ? 'medium' : 'regular'} color="text"
                dimColor={!s.nyou || s.waiting} wrap="wrap">
                {c.ask.includes('👉') ? c.ask : `👉 ${c.ask}`}
              </Text>
              {c.extra > 0 && <Text size="footnote" color="subtle">{` +${c.extra} more`}</Text>}
            </Box>
          )}
          {s.free && a.opts.length > 0 && (
            <Box flexDirection="row" flexWrap="wrap" gap="xs">
              {a.opts.map(o => (
                <Button key={`p-${c.id}-${o.i}`} hotkey={String(o.i + 1)} {...(o.best ? { variant: 'primary' } : {})}
                  label={`${o.i + 1}. ${plain(o.text, 70)}`} onPress={pick(c, o.text)} />
              ))}
            </Box>
          )}
          {s.free && a.cmd !== '' && (
            <Box flexDirection="row" gap="xs" alignItems="center">
              <Button key={'r-' + c.id} label="Run ▸ ask the thread" onPress={run(c, a.cmd)} />
              <Text size="caption" mono color="subtle" wrap="truncate-end">{plain(a.cmd, 80)}</Text>
            </Box>
          )}
          {a.blocked && <Text size="caption" color="subtle">Choices need you in the thread (approval or open PR)</Text>}
          {noteLine(c)}
          {s.waiting && !s.unknown && <Text size="caption" color="subtle">Answered. Waiting for the thread.</Text>}
          {field && busy !== null && <Text size="caption" color="subtle">Another answer is sending…</Text>}
          <Box flexDirection="row" gap="xs" alignItems="center">
            {field && (
              <Box flexGrow={1}>
                <Input
                  key={'a-' + c.id}
                  placeholder="Type your answer"
                  submitLabel="send"
                  rows={1}
                  value={dr[c.id] ?? ''}
                  onInput={async (v: string) => { await touch(); await update($, drafts, x => ({ ...x, [c.id]: v })) }}
                  onSubmit={(v: string) => { if (busy === null) void send($, c.id, v) }}
                />
              </Box>
            )}
            {composer && (
              <Box flexGrow={1}>
                <Input
                  key={'m-' + c.id}
                  placeholder="Message this thread"
                  submitLabel="send"
                  rows={2}
                  value={dr[c.id] ?? ''}
                  onInput={async (v: string) => { await touch(); await update($, drafts, x => ({ ...x, [c.id]: v })) }}
                  onSubmit={(v: string) => { if (busy === null) void send($, c.id, v, x => canMessage(x, v), false) }}
                />
              </Box>
            )}
            {s.sendingThis && <Box flexGrow={1}><Text dimColor wrap="truncate-end">{dr[c.id] ?? ''}</Text></Box>}
            {s.nyou && !s.askable && a.opts.length === 0 && a.cmd === '' && (
              <Text size="caption" color="subtle">Answer in the thread (approval or open PR)</Text>
            )}
            {s.askable && Input === null && <Text size="caption" color="subtle">Answer from desktop or the thread</Text>}
            <Button key={'o-' + c.id} plain dimColor hover={{ dimColor: false }} label="Open" onPress={() => openNote(c)} />
          </Box>
        </Box>
      )
    }

    // A tile: glyph and kind colour, title (press to focus), age, ask, and its actions.
    const tile = (c: Card) => {
      const s = look(c)
      const a = acts(c)
      const focused = focus?.id === c.id
      const room = Math.max(10, grid.width - 4)
      return (
        <Box key={'t-' + c.id} width={grid.width} flexDirection="column" paddingX={1}
          borderStyle={s.fresh ? 'bold' : 'round'} borderColor={focused ? 'claude' : s.border}
          borderDimColor={!focused && !s.nyou && !s.unknown} hover={{ borderColor: s.accent, borderDimColor: false }}>
          <Box flexDirection="row" alignItems="center" gap="xs">
            {!rich && <Text color={s.accent}>▌</Text>}
            {glyph(c)}
            {chip(LABEL[s.k], s.accent)}
            {s.fresh && chip('NEW', 'warning')}
            <Text size="caption" color="subtle" tabular>{age(c.lastActivityAt, now)}</Text>
          </Box>
          <Button key={'f-' + c.id} plain label={'⤒ ' + cut(c.title, room - 2)} onPress={() => select(c)} />
          {s.k === 'unclear'
            ? <Text size="caption" italic color="subtle">No status table</Text>
            : c.ask !== '' && <Text size="footnote" dimColor={!s.nyou || s.waiting} wrap="truncate-end">{cut(c.ask, room * 2)}</Text>}
          {nt[c.id] !== undefined && <Text size="caption" color={noteLook(nt[c.id] ?? '').tone} wrap="truncate-end">{cut(nt[c.id] ?? '', room)}</Text>}
          {s.free && (a.opts.length > 0 || a.cmd !== '') && (
            <Box flexDirection="row" flexWrap="wrap" gap="xs">
              {a.opts.map(o => (
                <Button key={`tp-${c.id}-${o.i}`} {...(o.best ? { variant: 'primary' } : {})}
                  label={`${o.i + 1}. ${plain(o.text, Math.max(8, room - 6))}`} onPress={pick(c, o.text)} />
              ))}
              {a.cmd !== '' && <Button key={'tr-' + c.id} label="Run ▸" onPress={run(c, a.cmd)} />}
            </Box>
          )}
        </Box>
      )
    }

    const allClear = err === '' && at > 0 && list.length > 0 && cur['needs-you'] === 0 && cur.unclear === 0
    const ringOn = rich && at > 0 && !isPaused && !shaky

    return (
      <Box flexDirection="column" gap="sm" padding="sm">
        <Box flexDirection="column" gap="sm" {...(half > 0 ? { minHeight: half } : {})}>
          <Box flexDirection="column" gap="xs">
            <Box flexDirection="row" alignItems="center" justifyContent="space-between">
              <Text size="heading" weight="semibold">Thread deck</Text>
              <Box flexDirection="row" alignItems="center" gap="xs">
                <Text color={health}>●</Text>
                <Text size="caption" color="subtle" tabular>
                  {at > 0 ? `Updated ${clock(at)} · ${ago(at, now)} ago` : 'Updated never'}
                </Text>
                {ringOn && <Svg width={14} height={14} isInteractive alt="Next refresh in 10 seconds" source={ring(at)} />}
              </Box>
            </Box>
            {rich && list.length > 0 && <Svg width={280} height={8} isInteractive alt={countsAlt(cur)} source={bar(prev, cur)} />}
            {list.length > 0 && (
              <Box flexDirection="row" flexWrap="wrap" gap="xs" alignItems="center">
                {chips(cur).map(x => chip(x.text, ACCENT[x.kind]))}
                {up > 0 && <Text size="caption" color="warning">{`+${up}`}</Text>}
              </Box>
            )}
          </Box>

          {err !== '' && banner('error', <Text color="error" weight="medium" wrap="truncate-end">Poll failed: {err}</Text>)}
          {err === '' && stale && banner('error', <Text color="error" weight="medium">Stale: cards may be out of date</Text>)}
          {isPaused && banner('warning', <Text color="warning" weight="medium">Paused after 10 min idle</Text>,
            <Button key="resume" variant="primary" hotkey="r" label="Resume" onPress={async () => {
              await update($, paused, () => false)
              await update($, lastInput, () => Date.now())
              await poll($)
            }} />)}
          {allClear && <Text color="success" weight="medium">✓ Nothing needs you right now</Text>}

          {at === 0 && err === '' && <Text color="subtle">Loading threads…</Text>}
          {at > 0 && err === '' && list.length === 0 && (
            <Box flexDirection="column" alignItems="center" paddingY="lg" gap="xs">
              {rich && <Svg width={40} height={40} isInteractive alt="All clear" source={check()} />}
              <Text size="heading" weight="semibold">No open threads</Text>
              <Text size="caption" color="subtle">New threads appear here within 10 s.</Text>
            </Box>
          )}

          {focus !== null && focusView(focus)}
        </Box>

        {live.length > 0 && (
          <Box flexDirection="column" gap="xs">
            <Text size="caption" weight="semibold" color="subtle">{`ALL THREADS · ${live.length}`}</Text>
            <Box flexDirection="row" flexWrap="wrap" gap={1}>{live.map(tile)}</Box>
          </Box>
        )}

        {quiet.length > 0 && (
          <Box key="quiet" flexDirection="column" gap="xs">
            <Box flexDirection="row" justifyContent="space-between" alignItems="center" paddingX="sm">
              <Text color="inactive" size="footnote">{`◌ ${quiet.length} quiet thread${quiet.length === 1 ? '' : 's'}`}</Text>
              <Button key="quiet-toggle" plain dimColor hotkey="q" label={qOpen ? 'Hide' : 'Show'}
                onPress={() => update($, quietOpen, v => !v)} />
            </Box>
            {qOpen && quiet.map(line)}
          </Box>
        )}
      </Box>
    )
  })
}
