// What the owner can do from a thread's last reply: its status rows, a numbered pick list and a
// bash block, all found after the status table. Pure: no `$`. Nothing here runs anything: a Run
// press only asks the thread to run its own command.
import { lastReply, statusRows, plain, hash } from './parse.ts'

export type Row = { task: string; why: string; status: string }
export type Detail = { replyHash: string; rows: Row[]; options: string[]; recommended: number; command: string }

const HEADER = /^\|\s*Task\s*\|\s*Why\s*\|\s*Status\s*\|/
const ITEM = /^\s*(\d)[.)]\s+(\S.*)$/
const FENCE_OPEN = /^\s*```(bash|sh|zsh|shell)\s*$/
const FENCE_CLOSE = /^\s*```\s*$/
const MAX_OPTIONS = 4

// Control characters out, spaces folded, cut: the text sent back stays as the thread wrote it.
const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

// The first numbered list (1., 2., …, at most 4) in `lines`; blank lines may sit between items.
export function pickList(lines: readonly string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    const m = ITEM.exec(line)
    if (m && Number(m[1]) === out.length + 1) {
      out.push(clean(m[2] ?? '', 300))
      if (out.length === MAX_OPTIONS) break
      continue
    }
    if (out.length > 0 && line.trim() !== '') break
  }
  return out.filter(o => o !== '')
}

export function recommended(options: readonly string[]): number {
  const i = options.findIndex(o => /\(recommended\)/i.test(o))
  return i < 0 ? 0 : i
}

// The first closed ```bash block in `lines`, trimmed; '' when none.
export function bashBlock(lines: readonly string[]): string {
  let at = -1
  for (let i = 0; i < lines.length; i++) {
    if (at < 0) { if (FENCE_OPEN.test(lines[i] ?? '')) at = i; continue }
    if (FENCE_CLOSE.test(lines[i] ?? '')) return lines.slice(at + 1, i).join('\n').trim().slice(0, 4000)
  }
  return ''
}

export function detail(events: string | null): Detail {
  const reply = events === null ? null : lastReply(events)
  const base: Detail = { replyHash: hash(reply ?? ''), rows: [], options: [], recommended: 0, command: '' }
  if (reply === null) return base
  const lines = reply.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) if (HEADER.test((lines[i] ?? '').trim())) start = i
  if (start < 0) return base
  let end = start + 1
  while (end < lines.length && (lines[end] ?? '').trim().startsWith('|')) end++
  const rows = (statusRows(reply) ?? []).slice(0, 12)
    .map(r => ({ task: plain(r.task, 80), why: plain(r.why, 120), status: plain(r.status, 120) }))
  const after = lines.slice(end)
  const options = pickList(after)
  return { ...base, rows, options, recommended: recommended(options), command: bashBlock(after) }
}

// Options, recommended first, with their index in the thread's own list.
export function ranked(d: Pick<Detail, 'options' | 'recommended'>): Array<{ i: number; text: string; best: boolean }> {
  const all = d.options.map((text, i) => ({ i, text, best: i === d.recommended }))
  return [...all.filter(o => o.best), ...all.filter(o => !o.best)]
}

// What a Run press sends: a request to the thread, never the command itself run here.
export function runMessage(command: string): string {
  return `Please run the command from your last reply yourself (it starts with: ${plain(command, 60)}).`
}
