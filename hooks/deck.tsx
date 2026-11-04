import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Card, Thread } from './deck/types.ts'
import { toCard } from './deck/parse.ts'
import { order } from './deck/order.ts'
import { canAnswer } from './deck/gate.ts'
import { snap, recheck, compose, readResult, confirmText } from './deck/guard.ts'
import {
  ACCENT, LABEL, ago, bar, burst, check, chips, counts, countsAlt, isNew, markNew,
  noteLook, pulse, rise, ring, settleNotes, spinner,
} from './deck/look.ts'
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
  const prevList = await read($, cards)
  const old = new Map(prevList.map(c => [c.id, c]))
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
  // What changed since the last poll: drives the NEW mark, the bar slide and the +n.
  const first = prevList.length === 0 && (await read($, polledAt)) === 0
  const now = Date.now()
  const seen = await read($, noteSeen)
  let marks: Record<string, string> = {}
  await update($, firstNeedsAt, m => markNew(prevList, next, m, now, first))
  await update($, prevCounts, () => (first ? null : counts(prevList)))
  await update($, notes, n => { const r = settleNotes(n, seen, next); marks = r.seen; return r.notes })
  await update($, noteSeen, () => marks)
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


const TICK = '◐◓◑◒'
const PR_KEY = (s: string | null) => (s === 'OPEN' ? 'success' : s === 'MERGED' ? 'merged' : 'subtle')

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
    const els = $.ui.resolve(e) as Record<string, any>
    const { Box, Text, Button } = els
    // Terminal has no Svg, mobile no Input; their tables may still list one, so go by the surface too.
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : null
    const Input = e.surface !== 'mobile' && 'Input' in els ? els.Input : null
    const rich = Svg !== null
    const now = Date.now()
    const [list, at, err, fz, dr, busy, nt, isPaused, qOpen, fna, prev, ans] = await Promise.all([
      read($, cards), read($, polledAt), read($, pollError), read($, frozen),
      read($, drafts), read($, sending), read($, notes), read($, paused),
      read($, quietOpen), read($, firstNeedsAt), read($, prevCounts), read($, answered),
    ])
    const shown = order(list, fz)
    const stale = at > 0 && now - at > STALE_MS
    const cur = counts(list)
    const up = rise(prev, cur)
    const shaky = err !== '' || stale
    const health = shaky ? 'error' : isPaused ? 'warning' : at > 0 ? 'success' : 'subtle'
    const main = shown.filter(c => c.kind !== 'quiet')
    const quiet = shown.filter(c => c.kind === 'quiet')
    const touch = async () => {
      await update($, lastInput, () => Date.now())
      await update($, frozen, f => f ?? shown.map(c => c.id))
    }
    const openNote = (c: Card) => update($, notes, n => ({ ...n, [c.id]: `Click "${c.title}" in the sidebar` }))

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
      const look = noteLook(t)
      return (
        <Box flexDirection="row" gap="xs" alignItems="center">
          <Text color={look.tone}>{look.glyph}</Text>
          <Text size="footnote" color={look.tone}>{t}</Text>
        </Box>
      )
    }

    // A one-line row: done threads and expanded quiet ones.
    const line = (c: Card) => (
      <Box key={'l-' + c.id} flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" alignItems="center" paddingX="sm" gap="xs">
          <Box flexDirection="row" gap="xs" alignItems="center" flexShrink={1}>
            {glyph(c)}
            <Text size="footnote" color={c.kind === 'quiet' ? 'inactive' : undefined} dimColor={c.kind === 'done' || shaky} wrap="truncate-end">{c.title}</Text>
            {prChip(c)}
            <Text size="caption" color="subtle" tabular>{age(c.lastActivityAt, now)}</Text>
          </Box>
          <Button key={'o-' + c.id} plain dimColor hover={{ dimColor: false }} label="Open" onPress={() => openNote(c)} />
        </Box>
        {nt[c.id] !== undefined && <Box paddingX="sm">{noteLine(c)}</Box>}
      </Box>
    )

    const card = (c: Card) => {
      const k = c.kind
      const nyou = k === 'needs-you'
      const accent = ACCENT[k]
      const t = nt[c.id]
      const unknown = t !== undefined && noteLook(t).tone === 'error'
      const fresh = nyou && isNew(fna[c.id], now)
      const sendingThis = busy === c.id
      const waiting = ans[c.id] === JSON.stringify(snap(c))
      const askable = canAnswer(c)
      const border = unknown ? 'error' : nyou ? 'warning' : k === 'unclear' ? 'permission' : 'subtle'
      const field = askable && Input !== null && !sendingThis && !waiting && !unknown
      return (
        <Box key={'c-' + c.id} flexDirection="row" borderStyle={fresh ? 'bold' : 'round'} borderColor={border}
          borderDimColor={!nyou && !unknown} overflow="hidden" hover={{ borderColor: border === 'subtle' ? accent : border, borderDimColor: false }}>
          {rich && <Box width={1} backgroundColor={accent} />}
          <Box flexDirection="column" flexGrow={1} paddingX="sm" paddingY="xs" gap="xs">
            <Box flexDirection="row" alignItems="center" gap="xs">
              {!rich && <Text color={accent}>▌</Text>}
              {glyph(c)}
              {chip(LABEL[k], accent)}
              {fresh && chip('NEW', 'warning')}
              {fresh && rich && <Svg width={12} height={12} isInteractive alt="New" source={burst()} />}
              <Text weight={nyou || k === 'unclear' ? 'semibold' : 'medium'} size={nyou ? 'heading' : 'body'}
                dimColor={shaky} wrap="truncate-end">{c.title}</Text>
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
            {k === 'unclear' && (
              <Text size="footnote" italic color="subtle">No status table in the last reply. Open the thread.</Text>
            )}
            {k !== 'unclear' && c.ask !== '' && (
              <Box flexDirection="row" flexWrap="wrap">
                <Text size={nyou ? 'body' : 'footnote'} weight={nyou ? 'medium' : 'regular'} color="text"
                  dimColor={!nyou || waiting} wrap="wrap">
                  {c.ask.includes('👉') ? c.ask : `👉 ${c.ask}`}
                </Text>
                {c.extra > 0 && <Text size="footnote" color="subtle">{` +${c.extra} more`}</Text>}
              </Box>
            )}
            {noteLine(c)}
            {waiting && !unknown && <Text size="caption" color="subtle">Answered. Waiting for the thread.</Text>}
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
                    onInput={async (v: string) => { await touch(); await update($, drafts, d => ({ ...d, [c.id]: v })) }}
                    onSubmit={async (v: string) => { if (busy === null) await send($, c.id, v) }}
                  />
                </Box>
              )}
              {sendingThis && <Box flexGrow={1}><Text dimColor wrap="truncate-end">{dr[c.id] ?? ''}</Text></Box>}
              {nyou && !askable && <Text size="caption" color="subtle">Answer in the thread (approval or open PR)</Text>}
              {askable && Input === null && <Text size="caption" color="subtle">Answer from desktop or the thread</Text>}
              <Button key={'o-' + c.id} plain dimColor hover={{ dimColor: false }} label="Open" onPress={() => openNote(c)} />
            </Box>
          </Box>
        </Box>
      )
    }

    // Cards in the shown order, a section label before each run of one kind.
    const body: unknown[] = []
    main.forEach((c, i) => {
      if (i === 0 || main[i - 1]?.kind !== c.kind) {
        body.push(<Text size="caption" weight="semibold" color="subtle">{`${LABEL[c.kind]} · ${cur[c.kind]}`}</Text>)
      }
      body.push(c.kind === 'done' ? line(c) : card(c))
    })

    const allClear = err === '' && at > 0 && list.length > 0 && cur['needs-you'] === 0 && cur.unclear === 0
    const ringOn = rich && at > 0 && !isPaused && !shaky

    return (
      <Box flexDirection="column" gap="sm" padding="sm">
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

        {body.length > 0 && <Box flexDirection="column" gap="xs">{body}</Box>}

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
