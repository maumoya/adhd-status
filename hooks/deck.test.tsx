import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'adhd-status',
  component: 'Pane',
  requestId: 'thread-deck',
  surface: 'desktop',
  props: { title: 'Thread deck', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const table = (status: string) => `[assistant] | Task | Why | Status |\n|---|---|---|\n| Colours | look right | ${status} |`

const SAFE = { sessionId: 'local_aaaaaa111111', title: 'Colours', isRunning: false, lastActivityAt: '2026-11-04T05:00:00Z' }
const MERGE = { sessionId: 'local_bbbbbb222222', title: 'Release', isRunning: false, prNumber: 9, prState: 'OPEN', lastActivityAt: '2026-11-04T04:00:00Z' }
const QUIET = { sessionId: 'local_cccccc333333', title: 'Backlog', isRunning: false, lastActivityAt: '2026-11-04T03:00:00Z' }

// A card's shown text: glyph, kind chip, title, meta, ask, actions.
// The focus card when it is that thread, else its tile.
const cardText = async (ui: any, id: string): Promise<string> =>
  (await ui.find({ key: 'c-' + id }))?.text ?? (await ui.find({ key: 't-' + id }))?.text ?? ''
// Focus a thread by its tile.
const focus = async (ui: any, id: string) => ui.press({ key: 'f-' + id })

// Stands for the desktop app's session tools; `later` moves SAFE's activity on after the first read.
// `quiet` adds a thread with nothing pending; `flip` makes SAFE quiet until its activity moves on.
// `safeReply` replaces SAFE's last reply; `mcp` records every session tool called.
function engine(on: any, opts: { later?: boolean; brokenEvents?: boolean; listFailsAfter?: number; quiet?: boolean; flip?: boolean; safeReply?: string; mergeReply?: string; mcp?: string[] } = {}) {
  let lists = 0
  let safeReads = 0
  const sent: Array<Record<string, unknown>> = []
  on('command.register', () => ({ value: { command: 'deck' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: { cancel() {} } }))
  on('tool.call', (_: unknown, e: any) => e.tool === 'AskUserQuestion'
    ? { result: { questions: e.questions, answers: { [e.questions[0].question]: 'Send' } } }
    : { result: {} })
  on('mcp.call', (_: unknown, e: { tool: string; args: Record<string, unknown> }) => {
    const t = (s: string) => ({ value: { content: [{ type: 'text', text: s }] } })
    opts.mcp?.push(e.tool)
    if (e.tool === 'list_sessions') {
      lists++
      if (opts.listFailsAfter !== undefined && lists > opts.listFailsAfter) return { value: { content: [{ type: 'text', text: 'down' }], isError: true } }
      const safe = opts.later && lists > 1 ? { ...SAFE, lastActivityAt: '2026-11-04T05:05:00Z' } : SAFE
      return t(JSON.stringify(opts.quiet ? [safe, MERGE, QUIET] : [safe, MERGE]))
    }
    if (e.tool === 'list_events' && opts.brokenEvents && e.args.session_id === MERGE.sessionId)
      return { value: { content: [{ type: 'text', text: 'nope' }], isError: true } }
    if (e.tool === 'list_events' && e.args.session_id === QUIET.sessionId) return t(table('later'))
    if (e.tool === 'list_events' && e.args.session_id === SAFE.sessionId && opts.flip && ++safeReads === 1) return t(table('later'))
    if (e.tool === 'list_events')
      return t(e.args.session_id === SAFE.sessionId ? opts.safeReply ?? table('👉 you: which colour?') : opts.mergeReply ?? table('👉 you: merge it?'))
    if (e.tool === 'send_message') { sent.push(e.args); return t('ok (delivery: delivered; message_id: m42)') }
    return t('')
  })
  return sent
}

test('only the safe card offers Answer, and there is no approval verb', async ($, on) => {
  engine(on)
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount(PANE)
  await focus(ui, SAFE.sessionId)
  expect(await ui.find({ key: 'a-' + SAFE.sessionId })).toBeDefined()
  expect(await ui.find({ key: 'a-' + MERGE.sessionId })).toBeUndefined()
  expect(await ui.find({ type: 'Button', text: /merge|adopt|approve/i })).toBeUndefined()
  expect(await cardText(ui, SAFE.sessionId)).toMatch(/NEEDS YOU\s*Colours/)
  await ui.unmount()
})

test('new activity before the send aborts it', async ($, on) => {
  const sent = engine(on, { later: true })
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount(PANE)
  await focus(ui, SAFE.sessionId)
  await ui.input({ key: 'a-' + SAFE.sessionId, text: 'blue', kind: 'submit' })
  expect(sent.length).toBe(0)
  expect(await ui.find({ type: 'Text', text: /Changed — refreshed/ })).toBeDefined()
  await ui.unmount()
})

test('an unchanged thread gets one send with the context line', async ($, on) => {
  const sent = engine(on)
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount(PANE)
  await focus(ui, SAFE.sessionId)
  // A double press at once: still one send. Then the top releases it for the next thread.
  const a = 'a-' + SAFE.sessionId
  await Promise.all([ui.input({ key: a, text: 'blue', kind: 'submit' }), ui.input({ key: a, text: 'blue', kind: 'submit' })])
  expect(await ui.find({ key: a })).toBeUndefined()
  expect(await ui.find({ key: 'm-' + SAFE.sessionId })).toBeUndefined()
  expect(sent.length).toBe(1)
  expect(sent[0]?.session_id).toBe(SAFE.sessionId)
  expect(String(sent[0]?.message)).toBe('blue\n\n(thread deck · re: Colours — 👉 you: which colour?)')
  expect(await ui.find({ type: 'Text', text: /Sent · m42/ })).toBeDefined()
  await ui.unmount()
})

test('one thread failing to read is only that card unclear; a failed list keeps the cards', async ($, on) => {
  engine(on, { brokenEvents: true, listFailsAfter: 1 })
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount(PANE)
  expect(await cardText(ui, SAFE.sessionId)).toMatch(/NEEDS YOU\s*Colours/)
  expect(await cardText(ui, MERGE.sessionId)).toMatch(/UNCLEAR\s*\w*\s*⤒?\s*Release/)
  await ui.press({ key: 'o-' + SAFE.sessionId })
  expect(await ui.find({ type: 'Text', text: /Click "Colours" in the sidebar/ })).toBeDefined()
  await $.command.run({ command: 'deck' })
  expect(await ui.find({ type: 'Text', text: /Poll failed: down/ })).toBeDefined()
  expect(await cardText(ui, SAFE.sessionId)).toMatch(/NEEDS YOU\s*Colours/)
  await ui.unmount()
})

test('the header counts each kind in chips and in the status bar', async ($, on) => {
  engine(on, { brokenEvents: true, quiet: true })
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /^ 1 NEEDS YOU $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ 1 UNCLEAR $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ 1 QUIET $/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /RUNNING|DONE/ })).toBeUndefined()
  const svgs = await ui.findAll({ type: 'Svg' })
  expect(svgs.find(s => /need/.test(String(s.props.alt)))?.props.alt).toBe('1 needs you, 1 unclear, 1 quiet')
  // Thread text never reaches an SVG.
  for (const s of svgs) expect(String(s.props.source) + String(s.props.alt)).not.toMatch(/Colours|Release|Backlog|colour/)
  await ui.unmount()
})

test('quiet threads fold into one row that opens and closes', async ($, on) => {
  engine(on, { quiet: true })
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /1 quiet thread$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Backlog' })).toBeUndefined()
  expect((await ui.find({ key: 'quiet-toggle' }))?.props.label).toBe('Show')
  await ui.press({ key: 'quiet-toggle' })
  expect(await ui.find({ type: 'Text', text: 'Backlog' })).toBeDefined()
  expect(await ui.find({ key: 'o-' + QUIET.sessionId })).toBeDefined()
  expect((await ui.find({ key: 'quiet-toggle' }))?.props.label).toBe('Hide')
  await ui.press({ key: 'quiet-toggle' })
  expect(await ui.find({ type: 'Text', text: 'Backlog' })).toBeUndefined()
  await ui.unmount()
})

test('a card that just started needing the owner is marked NEW; the first poll marks none', async ($, on) => {
  engine(on, { flip: true, later: true })
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'c-' + SAFE.sessionId })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^ NEW $/ })).toBeUndefined()
  await $.command.run({ command: 'deck' })
  expect(await cardText(ui, SAFE.sessionId)).toMatch(/NEEDS YOU\s*NEW\s*\w*\s*⤒?\s*Colours/)
  expect((await ui.find({ key: 't-' + SAFE.sessionId }))?.props.borderStyle).toBe('bold')
  expect(await ui.find({ type: 'Text', text: '+1' })).toBeDefined()
  // The thread that needed the owner all along is not new.
  expect(await cardText(ui, MERGE.sessionId)).not.toMatch(/NEW/)
  await ui.unmount()
})

test('the terminal draws the same deck without SVG', async ($, on) => {
  engine(on, { quiet: true })
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await focus(ui, SAFE.sessionId)
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await cardText(ui, SAFE.sessionId)).toMatch(/▌\s*●\s*NEEDS YOU\s*Colours/)
  expect(await ui.find({ key: 'a-' + SAFE.sessionId })).toBeDefined()
  expect(await ui.find({ key: 'quiet-toggle' })).toBeDefined()
  await ui.unmount()
})

test('mobile shows the deck with no field and says where to answer', async ($, on) => {
  engine(on)
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
  await focus(ui, SAFE.sessionId)
  expect(await cardText(ui, SAFE.sessionId)).toMatch(/NEEDS YOU\s*Colours/)
  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Answer from desktop or the thread' })).toBeDefined()
  await ui.unmount()
})

const PICK = table('👉 you: pick one') + '\n\nOptions:\n\n1. Red palette\n2. Blue palette (Recommended)\n\n```bash\nnpm test\n```'

test('focus falls back to the oldest needs-you thread, and a tile click moves it', async ($, on) => {
  engine(on)
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount(PANE)
  // MERGE waited longest, so it is the focus; both threads have a tile.
  expect(await ui.find({ key: 'c-' + MERGE.sessionId })).toBeDefined()
  expect(await ui.find({ key: 'c-' + SAFE.sessionId })).toBeUndefined()
  expect(await ui.find({ key: 't-' + SAFE.sessionId })).toBeDefined()
  expect(await ui.find({ key: 't-' + MERGE.sessionId })).toBeDefined()
  await focus(ui, SAFE.sessionId)
  expect(await ui.find({ key: 'c-' + SAFE.sessionId })).toBeDefined()
  expect(await ui.find({ key: 'c-' + MERGE.sessionId })).toBeUndefined()
  expect(await ui.find({ key: 'a-' + SAFE.sessionId })).toBeDefined()
  await ui.unmount()
})

test('the focus shows the conversation with the ask', async ($, on) => {
  engine(on, { safeReply: PICK })
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount(PANE)
  await focus(ui, SAFE.sessionId)
  // The conversation shows the reply (its table drawn as markdown); the grid only stands in without one.
  expect(String((await ui.find({ type: 'Markdown' }))?.props.text)).toMatch(/\| Colours \| look right \| 👉 you: pick one \|/)
  expect(await ui.find({ type: 'Text', text: 'Colours — 👉 you: pick one' })).toBeDefined()
  expect(await ui.find({ key: 'm-' + SAFE.sessionId })).toBeDefined()
  await ui.unmount()
})

test('an option button sends the option text once, after the Send confirm', async ($, on) => {
  const sent = engine(on, { safeReply: PICK })
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount(PANE)
  await focus(ui, SAFE.sessionId)
  // The recommended option comes first and is the primary button.
  const opts = (await ui.findAll({ type: 'Button' })).filter((b: any) => String(b.props.key ?? '').startsWith('p-'))
  expect(opts.map((b: any) => b.props.label)).toEqual(['2. Blue palette Recommended', '1. Red palette'])
  expect(opts[0]?.props.variant).toBe('primary')
  const key = 'p-' + SAFE.sessionId + '-1'
  await Promise.all([ui.press({ key }), ui.press({ key })])
  expect(sent.length).toBe(1)
  expect(sent[0]?.session_id).toBe(SAFE.sessionId)
  expect(String(sent[0]?.message)).toBe('Blue palette (Recommended)\n\n(thread deck · re: Colours — 👉 you: pick one)')
  expect(await ui.find({ key })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Sent · m42/ })).toBeDefined()
  await ui.unmount()
})

test('Run asks the thread to run its command and runs nothing here', async ($, on) => {
  const mcp: string[] = []
  const sent = engine(on, { safeReply: PICK, mcp })
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount(PANE)
  // The tile carries the same actions as the focus.
  expect(await ui.find({ key: 'tr-' + SAFE.sessionId })).toBeDefined()
  await ui.press({ key: 'tr-' + SAFE.sessionId })
  expect(sent.length).toBe(1)
  expect(String(sent[0]?.message)).toBe('Please run the command from your last reply yourself (it starts with: npm test).\n\n(thread deck · re: Colours — 👉 you: pick one)')
  expect([...new Set(mcp)].sort()).toEqual(['list_events', 'list_sessions', 'send_message'])
  await ui.unmount()
})

test('an approval option, an approval command or an open PR shows no option or Run button', async ($, on) => {
  const risky = table('👉 you: pick one') + '\n\n1. Merge it now\n2. Wait\n\n```bash\ngit push\n```'
  engine(on, { safeReply: risky, mergeReply: PICK.replace('Colours', 'Release') })
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount(PANE)
  for (const id of [SAFE.sessionId, MERGE.sessionId]) {
    await focus(ui, id)
    const keys = (await ui.findAll({ type: 'Button' })).map((b: any) => String(b.props.key ?? ''))
    expect(keys.filter(k => /^(p|tp|r|tr)-/.test(k))).toEqual([])
    expect(await ui.find({ type: 'Text', text: /Choices need you in the thread/ })).toBeDefined()
    expect(await ui.find({ key: 'o-' + id })).toBeDefined()
  }
  await ui.unmount()
})
