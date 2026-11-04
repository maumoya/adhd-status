// Reads a thread's transcript text (list_events output) into a card. Pure: no `$`.
import type { Card, Thread } from './types.ts'

type Row = { task: string; why: string; status: string }

const BLOCK = /^\[(assistant|user)\] ?/
const HEADER = /^\|\s*Task\s*\|\s*Why\s*\|\s*Status\s*\|/

// The newest assistant block that holds more than tool-call lines.
export function lastReply(events: string): string | null {
  const blocks: Array<{ role: string; lines: string[] }> = []
  for (const line of events.split('\n')) {
    const m = BLOCK.exec(line)
    if (m) blocks.push({ role: m[1], lines: [line.slice(m[0].length)] })
    else if (blocks.length > 0) blocks[blocks.length - 1].lines.push(line)
  }
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]
    if (b.role !== 'assistant') continue
    const text = b.lines.join('\n').trim()
    if (text.split('\n').every(l => l.trim() === '' || /^\(called [^)]*\)$/.test(l.trim()))) continue
    return text
  }
  return null
}

// Rows of the last `| Task | Why | Status |` table in the reply.
export function statusRows(reply: string): Row[] | null {
  const lines = reply.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) if (HEADER.test(lines[i].trim())) start = i
  if (start < 0) return null
  const rows: Row[] = []
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim()
    if (!line.startsWith('|')) break
    const cells = line.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
    if (cells.every(c => /^:?-+:?$/.test(c))) continue
    rows.push({ task: cells[0] ?? '', why: cells[1] ?? '', status: cells[2] ?? '' })
  }
  return rows
}

// Thread text as one safe line: no control chars, no markup, cut to `max`.
export function plain(s: string, max?: number): string {
  const out = s
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/~~/g, '')
    .replace(/[`*_#<>[\]()|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (max === undefined || out.length <= max) return out
  return out.slice(0, max - 1) + '…'
}

// FNV-1a 32-bit, as 8 hex chars.
export function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export function toCard(t: Thread, events: string | null): Card {
  const reply = events === null ? null : lastReply(events)
  const base = { ...t, ask: '', extra: 0, replyHash: hash(reply ?? '') }
  if (t.isRunning) return { ...base, kind: 'busy' }
  const rows = reply === null ? null : statusRows(reply)
  if (rows === null || rows.length === 0) return { ...base, kind: 'unclear' }
  const asks = rows.filter(r => r.status.includes('👉'))
  if (asks.length > 0) {
    return { ...base, kind: 'needs-you', ask: plain(`${asks[0].task} — ${asks[0].status}`), extra: asks.length - 1 }
  }
  if (rows.every(r => r.status.includes('✅'))) return { ...base, kind: 'done' }
  return { ...base, kind: 'quiet' }
}
