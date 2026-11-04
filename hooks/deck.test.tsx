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

// Stands for the desktop app's session tools; `later` moves SAFE's activity on after the first read.
function engine(on: any, opts: { later?: boolean; brokenEvents?: boolean; listFailsAfter?: number } = {}) {
  let lists = 0
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
      return t(JSON.stringify([safe, MERGE]))
    }
    if (e.tool === 'list_events' && opts.brokenEvents && e.args.session_id === MERGE.sessionId)
      return { value: { content: [{ type: 'text', text: 'nope' }], isError: true } }
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
  expect(await ui.find({ type: 'Text', text: /\[needs-you\] Colours/ })).toBeDefined()
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
  // A double press at once, then a late third: still one send.
  const a = 'a-' + SAFE.sessionId
  await Promise.all([ui.input({ key: a, text: 'blue', kind: 'submit' }), ui.input({ key: a, text: 'blue', kind: 'submit' })])
  await ui.input({ key: a, text: 'blue', kind: 'submit' })
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
  expect(await ui.find({ type: 'Text', text: /\[needs-you\] Colours/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\[unclear\] Release/ })).toBeDefined()
  await ui.press({ key: 'o-' + SAFE.sessionId })
  expect(await ui.find({ type: 'Text', text: /Click "Colours" in the sidebar/ })).toBeDefined()
  await $.command.run({ command: 'deck' })
  expect(await ui.find({ type: 'Text', text: /Poll failed: down/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\[needs-you\] Colours/ })).toBeDefined()
  await ui.unmount()
})
