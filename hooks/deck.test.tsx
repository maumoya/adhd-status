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
const cardText = async (ui: any, id: string): Promise<string> => (await ui.find({ key: 'c-' + id }))?.text ?? ''

// Stands for the desktop app's session tools; `later` moves SAFE's activity on after the first read.
// `quiet` adds a thread with nothing pending; `flip` makes SAFE quiet until its activity moves on.
function engine(on: any, opts: { later?: boolean; brokenEvents?: boolean; listFailsAfter?: number; quiet?: boolean; flip?: boolean } = {}) {
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
      return t(e.args.session_id === SAFE.sessionId ? table('👉 you: which colour?') : table('👉 you: merge it?'))
    if (e.tool === 'send_message') { sent.push(e.args); return t('ok (delivery: delivered; message_id: m42)') }
    return t('')
  })
  return sent
}

test('only the safe card offers Answer, and there is no approval verb', async ($, on) => {
  engine(on)
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount(PANE)
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
  await ui.input({ key: 'a-' + SAFE.sessionId, text: 'blue', kind: 'submit' })
  expect(sent.length).toBe(0)
  expect(await ui.find({ type: 'Text', text: /Changed — refreshed/ })).toBeDefined()
  await ui.unmount()
})

test('an unchanged thread gets one send with the context line', async ($, on) => {
  const sent = engine(on)
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount(PANE)
  // A double press at once: still one send. Then the field is gone until the ask changes.
  const a = 'a-' + SAFE.sessionId
  await Promise.all([ui.input({ key: a, text: 'blue', kind: 'submit' }), ui.input({ key: a, text: 'blue', kind: 'submit' })])
  expect(await ui.find({ key: a })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Answered\. Waiting for the thread\./ })).toBeDefined()
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
  expect(await cardText(ui, MERGE.sessionId)).toMatch(/UNCLEAR\s*Release/)
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
  expect(await cardText(ui, SAFE.sessionId)).toMatch(/NEEDS YOU\s*NEW\s*Colours/)
  expect((await ui.find({ key: 'c-' + SAFE.sessionId }))?.props.borderStyle).toBe('bold')
  expect(await ui.find({ type: 'Text', text: '+1' })).toBeDefined()
  // The thread that needed the owner all along is not new.
  expect(await cardText(ui, MERGE.sessionId)).not.toMatch(/NEW/)
  await ui.unmount()
})

test('the terminal draws the same deck without SVG', async ($, on) => {
  engine(on, { quiet: true })
  await $.command.run({ command: 'deck' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
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
  expect(await cardText(ui, SAFE.sessionId)).toMatch(/NEEDS YOU\s*Colours/)
  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Answer from desktop or the thread' })).toBeDefined()
  await ui.unmount()
})
