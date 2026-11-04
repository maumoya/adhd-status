// How the deck looks: colours, counts, chip words and the SVG drawings. Pure: no `$`.
// Every SVG here is built from fixed shapes, hex constants and numbers only: thread text
// never reaches an SVG source or alt.
import type { Card, Kind } from './types.ts'

export const KINDS: readonly Kind[] = ['needs-you', 'unclear', 'busy', 'done', 'quiet']

// Theme keys for Box/Text/Button (follow the owner's theme, light or dark).
export const ACCENT: Record<Kind, 'warning' | 'permission' | 'suggestion' | 'success' | 'inactive'> = {
  'needs-you': 'warning', unclear: 'permission', busy: 'suggestion', done: 'success', quiet: 'inactive',
}

// SVG cannot read theme keys: mid-tone hexes that read on light and dark.
export const HEX: Record<Kind, string> = {
  'needs-you': '#E8A33D', unclear: '#8B7FE8', busy: '#4C8DF6', done: '#3FA66B', quiet: '#9AA0A6',
}

export const LABEL: Record<Kind, string> = {
  'needs-you': 'NEEDS YOU', unclear: 'UNCLEAR', busy: 'RUNNING', done: 'DONE', quiet: 'QUIET',
}

const WORD: Record<Kind, string> = {
  'needs-you': 'need you', unclear: 'unclear', busy: 'running', done: 'done', quiet: 'quiet',
}

export const NEW_MS = 30_000

export type Counts = Record<Kind, number>

export function counts(cards: readonly Card[]): Counts {
  const c: Counts = { 'needs-you': 0, unclear: 0, busy: 0, done: 0, quiet: 0 }
  for (const x of cards) c[x.kind]++
  return c
}

// Header chips, one per kind with a count: "2 NEED YOU", "1 NEEDS YOU", "3 RUNNING".
export function chips(c: Counts): Array<{ kind: Kind; text: string }> {
  return KINDS.filter(k => c[k] > 0).map(k => ({
    kind: k,
    text: `${c[k]} ${k === 'needs-you' && c[k] > 1 ? 'NEED YOU' : LABEL[k]}`,
  }))
}

// The status bar's alt: "2 need you, 1 unclear, 3 running".
export function countsAlt(c: Counts): string {
  const parts = KINDS.filter(k => c[k] > 0).map(k => `${c[k]} ${k === 'needs-you' && c[k] === 1 ? 'needs you' : WORD[k]}`)
  return parts.length === 0 ? 'No threads' : parts.join(', ')
}

// How many more threads need the owner than at the poll before; 0 when unknown.
export function rise(prev: Counts | null, cur: Counts): number {
  return prev === null ? 0 : Math.max(0, cur['needs-you'] - prev['needs-you'])
}

// A number fit for an SVG attribute: finite, at most 2 decimals.
const n = (x: number): string => (Number.isFinite(x) ? String(Math.round(x * 100) / 100) : '0')

type Seg = { x: number; w: number }

export function layout(c: Counts, width: number, gap = 2): Record<Kind, Seg> {
  const total = KINDS.reduce((s, k) => s + c[k], 0)
  const shown = KINDS.filter(k => c[k] > 0).length
  const room = Math.max(0, width - gap * Math.max(0, shown - 1))
  const out = {} as Record<Kind, Seg>
  let x = 0
  for (const k of KINDS) {
    const w = total === 0 ? 0 : (room * c[k]) / total
    out[k] = { x, w }
    if (w > 0) x += w + gap
  }
  return out
}

const slide = (attr: string, from: number, to: number) =>
  `<animate attributeName="${attr}" values="${n(from)};${n(to)}" keyTimes="0;1" dur="450ms" fill="freeze" calcMode="spline" keySplines="0.2 0 0 1"/>`

// The status bar: one segment per kind, sliding from the last poll's shares to this one's.
export function bar(prev: Counts | null, cur: Counts, width = 280, height = 8): string {
  const a = prev === null ? layout(counts([]), width) : layout(prev, width)
  const b = layout(cur, width)
  const w = n(width)
  const h = n(height)
  const rects = KINDS.map(k => {
    if (a[k].w === 0 && b[k].w === 0) return ''
    const pulse = k === 'needs-you' && cur[k] > 0
      ? '<animate attributeName="opacity" values="1;.55;1" dur="2.4s" repeatCount="indefinite"/>'
      : ''
    return `<rect x="${n(b[k].x)}" y="0" width="${n(b[k].w)}" height="${h}" fill="${HEX[k]}">` +
      `${slide('x', a[k].x, b[k].x)}${slide('width', a[k].w, b[k].w)}${pulse}</rect>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none">` +
    `<defs><clipPath id="r"><rect width="${w}" height="${h}" rx="${n(height / 2)}"/></clipPath></defs>` +
    `<g clip-path="url(#r)"><rect width="${w}" height="${h}" fill="${HEX.quiet}" fill-opacity=".18"/>${rects}</g></svg>`
}

// The refresh ring: fills over one poll interval. `stamp` (the poll time) makes each poll's
// source new, so a host that keeps a frame per source restarts it.
export function ring(stamp: number, seconds = 10): string {
  const c = 31.42
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" width="14" height="14" data-poll="${n(Math.floor(stamp))}">` +
    `<circle cx="7" cy="7" r="5" fill="none" stroke="${HEX.quiet}" stroke-opacity=".35" stroke-width="2"/>` +
    `<circle cx="7" cy="7" r="5" fill="none" stroke="${HEX.busy}" stroke-width="2" stroke-linecap="round" ` +
    `stroke-dasharray="${c}" stroke-dashoffset="0" transform="rotate(-90 7 7)">` +
    `<animate attributeName="stroke-dashoffset" from="${c}" to="0" dur="${n(seconds)}s" fill="freeze"/></circle></svg>`
}

// A running thread: a core dot with a halo pulsing out.
export function pulse(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="12" height="12">` +
    `<circle cx="6" cy="6" r="3" fill="${HEX.busy}" opacity=".6">` +
    `<animate attributeName="r" values="3;6" dur="1.6s" repeatCount="indefinite"/>` +
    `<animate attributeName="opacity" values=".6;0" dur="1.6s" repeatCount="indefinite"/></circle>` +
    `<circle cx="6" cy="6" r="3" fill="${HEX.busy}"/></svg>`
}

// A send in flight: an arc turning.
export function spinner(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="12" height="12">` +
    `<circle cx="6" cy="6" r="4.5" fill="none" stroke="${HEX.quiet}" stroke-opacity=".3" stroke-width="1.5"/>` +
    `<path d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5" fill="none" stroke="${HEX.busy}" stroke-width="1.5" stroke-linecap="round">` +
    `<animateTransform attributeName="transform" type="rotate" from="0 6 6" to="360 6 6" dur="0.9s" repeatCount="indefinite"/>` +
    `</path></svg>`
}

// A thread that just started needing the owner: three rings, then still.
export function burst(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="12" height="12">` +
    `<circle cx="6" cy="6" r="2" fill="none" stroke="${HEX['needs-you']}" stroke-width="1.5" opacity="0">` +
    `<animate attributeName="r" values="2;5.5" dur="0.8s" repeatCount="3"/>` +
    `<animate attributeName="opacity" values="1;0" dur="0.8s" repeatCount="3" fill="freeze"/></circle>` +
    `<circle cx="6" cy="6" r="2.5" fill="${HEX['needs-you']}"/></svg>`
}

// The empty state: a ring with a check drawn in once.
export function check(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">` +
    `<circle cx="20" cy="20" r="17" fill="none" stroke="${HEX.done}" stroke-width="2.5"/>` +
    `<path d="M12.5 20.5l5.5 5.5 10-11" fill="none" stroke="${HEX.done}" stroke-width="3" stroke-linecap="round" ` +
    `stroke-linejoin="round" stroke-dasharray="24" stroke-dashoffset="0">` +
    `<animate attributeName="stroke-dashoffset" from="24" to="0" dur="600ms" fill="freeze"/></path></svg>`
}

// When each needs-you card began needing the owner: `now` for one that became needs-you since
// the last poll, 0 for one that already was (or on the first poll). Others drop out.
export function markNew(
  prev: readonly Card[], next: readonly Card[], seen: Record<string, number>, now: number, first: boolean,
): Record<string, number> {
  const before = new Map(prev.map(c => [c.id, c.kind]))
  const out: Record<string, number> = {}
  for (const c of next) {
    if (c.kind !== 'needs-you') continue
    const was = seen[c.id]
    if (was !== undefined) out[c.id] = was
    else out[c.id] = first || before.get(c.id) === 'needs-you' ? 0 : now
  }
  return out
}

export function isNew(at: number | undefined, now: number): boolean {
  return at !== undefined && at > 0 && now - at < NEW_MS
}

// Notes clear once the thread's reply changes after the poll that first saw the note.
// `seen` holds, per note, the reply hash that poll found.
export function settleNotes(
  notes: Record<string, string>, seen: Record<string, string>, cards: readonly Card[],
): { notes: Record<string, string>; seen: Record<string, string> } {
  const hashes = new Map(cards.map(c => [c.id, c.replyHash]))
  const kept: Record<string, string> = {}
  const marks: Record<string, string> = {}
  for (const [id, text] of Object.entries(notes)) {
    const h = hashes.get(id)
    const was = seen[id]
    if (h !== undefined && was !== undefined && was !== h) continue
    kept[id] = text
    if (h !== undefined) marks[id] = was ?? h
  }
  return { notes: kept, seen: marks }
}

export type Tone = 'success' | 'subtle' | 'warning' | 'error' | 'suggestion'

// A card note's glyph and colour, read from its fixed opening words.
export function noteLook(text: string): { tone: Tone; glyph: string } {
  if (text.startsWith('Sent')) return { tone: 'success', glyph: '✓' }
  if (text.startsWith('Not sent')) return { tone: 'subtle', glyph: '–' }
  if (text.startsWith('Changed')) return { tone: 'warning', glyph: '↻' }
  if (text.startsWith('Busy')) return { tone: 'warning', glyph: '●' }
  if (text.startsWith('Unknown')) return { tone: 'error', glyph: '!' }
  if (text.startsWith('Click')) return { tone: 'subtle', glyph: '↖' }
  return { tone: 'subtle', glyph: '·' }
}

export function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (!Number.isFinite(s)) return '?'
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`
}

// Tiles of one width so 3 to 5 fit a wide pane: at least 30 cells each, one cell between.
export function tileGrid(cols: number, min = 30, most = 5): { perRow: number; width: number } {
  const room = Math.max(min, Math.floor(Number.isFinite(cols) ? cols : 80) - 2)
  const perRow = Math.max(1, Math.min(most, Math.floor((room + 1) / (min + 1))))
  return { perRow, width: Math.floor((room - (perRow - 1)) / perRow) }
}

// A status cell's colour, by the emoji it holds.
export function statusTone(s: string): 'success' | 'warning' | 'error' | 'suggestion' | 'text' {
  if (s.includes('👉')) return 'warning'
  if (/[❌⛔🔴]/u.test(s)) return 'error'
  if (s.includes('✅')) return 'success'
  if (/[⏳🔄🟡]/u.test(s)) return 'suggestion'
  return 'text'
}

// The focus: the chosen thread while it is listed and not quiet, else the longest-waiting
// needs-you thread, else the first non-quiet one.
// `released`: threads just answered from the deck (id → activity then); auto-pick skips them until
// they move again, so the top hands over to the next one that needs you.
export function pickFocus(cards: readonly Card[], id: string | null, released: Readonly<Record<string, string>> = {}): Card | null {
  const live = cards.filter(c => c.kind !== 'quiet')
  const chosen = id === null ? undefined : live.find(c => c.id === id)
  if (chosen) return chosen
  const open = live.filter(c => released[c.id] !== c.lastActivityAt)
  const needs = open.filter(c => c.kind === 'needs-you').sort((a, b) => a.lastActivityAt.localeCompare(b.lastActivityAt))
  return needs[0] ?? open[0] ?? live[0] ?? null
}

// Cut to `max` characters with an ellipsis; the text is otherwise kept as written.
export function cut(s: string, max: number): string {
  const n = Math.max(1, Math.floor(max))
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}
