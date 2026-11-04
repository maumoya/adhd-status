// The focused thread's recent conversation, as the deck draws it. Pure: no `$`.
// Thread text is untrusted: links lose their target and bare addresses become code, so nothing it
// draws can be pressed.

export type Msg = { role: 'user' | 'assistant' | 'tool'; text: string }

const BLOCK = /^\[(assistant|user|result)\] ?/
const CALL = /^\(called ([^)]*)\)$/
const MAX_MSG = 4000

// list_events text into messages, oldest first. Tool calls fold into one 'tool' line per run.
export function chat(events: string | null): Msg[] {
  if (events === null) return []
  const blocks: Array<{ role: string; lines: string[] }> = []
  for (const line of events.split('\n')) {
    const m = BLOCK.exec(line)
    if (m) blocks.push({ role: m[1], lines: [line.slice(m[0].length)] })
    else if (blocks.length > 0) blocks[blocks.length - 1].lines.push(line)
  }
  const out: Msg[] = []
  const tool = (name: string) => {
    const last = out[out.length - 1]
    if (last?.role === 'tool') { if (!last.text.split(', ').includes(name)) last.text += `, ${name}` }
    else out.push({ role: 'tool', text: name })
  }
  for (const b of blocks) {
    if (b.role === 'result') continue
    const said: string[] = []
    for (const l of b.lines) {
      const c = CALL.exec(l.trim())
      if (c && b.role === 'assistant') tool(c[1].trim())
      else said.push(l)
    }
    const text = said.join('\n').trim()
    if (text === '') continue
    out.push({ role: b.role as 'user' | 'assistant', text: text.length > MAX_MSG ? text.slice(0, MAX_MSG - 1) + '…' : text })
  }
  return out
}

// The thread's latest reply, whole, and the owner's message it answers: what the focus shows,
// as the thread itself shows it. Either is null when the transcript has none.
export function lastExchange(msgs: readonly Msg[]): { you: string | null; reply: string | null } {
  let i = msgs.length - 1
  while (i >= 0 && msgs[i].role !== 'assistant') i--
  if (i < 0) return { you: null, reply: null }
  let j = i - 1
  while (j >= 0 && msgs[j].role !== 'user') j--
  return { you: j >= 0 ? msgs[j].text : null, reply: msgs[i].text }
}

// Markdown safe to draw: no pressable links or images, no raw tags, no control characters.
export function safeMd(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
    .replace(/<[^>\n]*>/g, '')
    .replace(/`[^`\n]*`|((?:https?|file|ftp|mailto):\/?\/?[^\s`)]+|www\.[^\s`)]+)/gi, (m, url) => (url ? '`' + url + '`' : m))
}

// The newest messages that fit `rows` rows `cols` wide; the oldest one kept may lose its head.
export function fit(msgs: readonly Msg[], rows: number, cols: number): Msg[] {
  const w = Math.max(20, cols)
  const cost = (t: string) => t.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / w)), 0) + 1
  const out: Msg[] = []
  let left = Math.max(4, rows)
  for (let i = msgs.length - 1; i >= 0 && left > 1; i--) {
    const m = msgs[i]
    const c = cost(m.text)
    if (c <= left) { out.unshift(m); left -= c; continue }
    const keep = m.text.split('\n').slice(-(left - 1)).join('\n')
    out.unshift({ ...m, text: '…\n' + keep.slice(-(left - 1) * w) })
    break
  }
  return out
}
