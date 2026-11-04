# Thread deck pane: visual and interaction design (2026-11-04)

Goal: in under 2 s the owner sees which thread needs them and what to type. Builder implements in
`hooks/deck.tsx`. Spec safety rules stay fixed: Answer only when `canAnswer` passes, no
merge/adopt/approve verbs, thread text plain `Text` only, keys by session id.

## 0. Ground rules

- Theme keys only on Box/Text/Button (light + dark). One kind, one colour:
  | Kind | Accent key | Chip label | SVG hex (SVG cannot read theme keys) |
  |---|---|---|---|
  | needs-you | `warning` | NEEDS YOU | `#E8A33D` |
  | unclear | `permission` | UNCLEAR | `#8B7FE8` |
  | busy | `suggestion` | RUNNING | `#4C8DF6` |
  | done | `success` | DONE | `#3FA66B` |
  | quiet | `inactive` | QUIET | `#9AA0A6` |
- `error` only for poll failure, stale, "Unknown" send. PR chip: OPEN `success`, MERGED `merged`, else `subtle`.
- Never put thread text in an `Svg` `source`/`alt`: SVG is built only from our numbers and fixed strings.
- `const els = $.ui.resolve(e)`; `rich = 'Svg' in els`; `canType = 'Input' in els`. `rich` false
  (terminal) = section 10; `canType` false (mobile) hides Answer.
- Chip = `<Text size="caption" weight="semibold" color="inverseText" backgroundColor={key}>` with a
  space each side inside the string (` NEEDS YOU `). Spacing steps only (`xs`..`lg`).

## 1. Pane frame

`<Box flexDirection="column" gap="sm" padding="sm">`: Header, Banners, All-clear or Empty state,
cards (`gap="xs"`), Quiet row.

## 2. Header

Row 1 `<Box flexDirection="row" alignItems="center" justifyContent="space-between">`:
- Left: `<Text size="heading" weight="semibold">Thread deck</Text>`.
- Right `<Box flexDirection="row" alignItems="center" gap="xs">`:
  - Health dot `<Text color={health}>●</Text>`: `success` poll ok < 60 s; `warning` paused or some
    `list_events` null; `error` poll error or stale.
  - `<Text size="caption" color="subtle" tabular>Updated 14:02:31 · 4s ago</Text>` ("never" first).
  - Refresh ring `Svg width={14} height={14} isInteractive alt="Next refresh in 10 seconds"`: grey
    track r=5 + `#4C8DF6` arc, `stroke-dasharray="31.4"`, `<animate attributeName="stroke-dashoffset"
    from="31.4" to="0" dur="10s" fill="freeze"/>`; restarts each poll. Hidden when paused or in error.
Row 2, status bar `Svg width={280} height={8} isInteractive alt="2 need you, 1 unclear, 3 running, 4 done, 5 quiet"`:
one `rect` per kind in table order (clip path `rx="4"`, 2 px gaps), width = share of total. Keep
last counts in a module variable `prevCounts`; each rect gets `<animate attributeName="width"
from={old} to={new} dur="450ms" fill="freeze" calcMode="spline" keySplines="0.2 0 0 1"/>` (x too):
the bar slides when a thread changes kind. needs-you rect > 0 also gets `<animate
attributeName="opacity" values="1;.55;1" dur="2.4s" repeatCount="indefinite"/>`.
Row 3, `<Box flexDirection="row" flexWrap="wrap" gap="xs">`: one chip per kind with count > 0
(`2 NEED YOU`); Text, not buttons (no filters in v1). For one poll after needs-you rises, append
`<Text size="caption" color="warning">+1</Text>`.

## 3. Banners (between header and cards)

`<Box borderStyle="round" borderColor={key} paddingX="sm" paddingY="xs" flexDirection="row"
justifyContent="space-between" alignItems="center">`:
- Poll failed: `error`, `<Text color="error" weight="medium" wrap="truncate-end">Poll failed: {err}</Text>`.
  Stale (> 60 s): `error`, "Stale: cards may be out of date". While either shows, titles get `dimColor`.
- Paused: `warning`, "Paused after 10 min idle" + `<Button key="resume" variant="primary" hotkey="r" label="Resume">`.
All clear, only when poll ok, cards exist, needs-you = 0 and unclear = 0 (spec: unclear is never
"nothing pending"): `<Text color="success" weight="medium">✓ Nothing needs you right now</Text>`.

## 4. Card anatomy (`<Box key={'c-' + id}>`)

Outer: `flexDirection="row" borderStyle="round" overflow="hidden"`, inner padding on the body.
- Accent bar: first child `<Box width={1} alignSelf="stretch" backgroundColor={accent}/>`.
- Body `<Box flexDirection="column" flexGrow={1} paddingX="sm" paddingY="xs" gap="xs">`:
  1. Title row (`row`, `alignItems="center"`, `gap="xs"`): status glyph (section 5) · kind chip ·
     `<Text weight="semibold" size={nyou ? 'heading' : 'body'} wrap="truncate-end">{title}</Text>`.
  2. Meta row (`row`, `gap="sm"`, all `size="caption"`): `<Text mono color="subtle">{id.slice(0,6)}</Text>`
     (spec: first 6 chars; current code slices 6..12, builder fixes to 0..6) · PR chip ` PR #88 OPEN `
     when `prNumber !== null` · `<Text color="subtle" tabular>{age} ago</Text>`.
  3. Ask line (focal): `<Text size="body" weight="medium" color="text" wrap="wrap">👉 {ask}</Text>`
     (prefix 👉 only if the ask does not already start with it) + `<Text color="subtle"> +{extra} more</Text>`.
     needs-you: full strength. busy/done: `dimColor`, `size="footnote"`, `weight="regular"`.
     unclear: `<Text italic color="subtle">No status table in the last reply. Open the thread.</Text>`.
  4. Feedback line (section 6), only when there is a note or a send in flight.
  5. Actions row (`row`, `gap="xs"`, `alignItems="center"`): Answer field first when allowed, then
     `<Button key={'o-'+id} plain dimColor label="Open">`. Answer: `<Input key={'a-'+id}
     placeholder="Type your answer" submitLabel="send" rows={1}>` wrapped in `<Box flexGrow={1}>`.
     needs-you without `canAnswer`: `<Text size="caption" color="subtle">Answer in the thread (approval or open PR)</Text>`.
Per kind (ADHD rule: one loud thing, everything else calm):
| Kind | Border | Accent bar | Title | Ask |
|---|---|---|---|---|
| needs-you | `borderColor="warning"` | `warning` | heading, semibold | body, medium, full |
| unclear | `borderColor="permission" borderDimColor` | `permission` | body, semibold | italic hint |
| busy | `borderColor="subtle" borderDimColor` | `suggestion` | body, medium | footnote, dim |
| done | `borderColor="subtle" borderDimColor` | `success` | body, regular, `dimColor` | footnote, dim |
Section label before each run of one kind in the shown (maybe frozen) order: `<Text size="caption"
weight="semibold" color="subtle">NEEDS YOU · 2</Text>`.

## 5. Live state glyphs (left of the title)

- Running: `Svg width={12} height={12} isInteractive alt="Running"`, viewBox `0 0 12 12`: core
  circle (6,6) r=3 `#4C8DF6` + halo same, with `<animate attributeName="r" values="3;6" dur="1.6s"
  repeatCount="indefinite"/>` and opacity `values=".6;0"` same timing (a pulse).
- Idle: `<Text color={accent}>●</Text>` (needs-you), `○` for done, `◌` for unclear.
- New needs-you (< 30 s, module map `firstNeedsAt[id]`): `borderStyle="bold"`, ` NEW ` chip
  (`warning`) after the kind chip, accent bar as `Svg width={4}` with one-shot opacity `values=
  "0.3;1;0.3;1" dur="1.2s" fill="freeze"`. Next poll after 30 s: normal look. No sound, no loop.

## 6. Send feedback on the card

`<Box flexDirection="row" gap="xs" alignItems="center">` glyph + `<Text size="footnote">`; store notes as `{tone, text}`:
| State | Glyph | Text colour | Card change |
|---|---|---|---|
| Sending (`sending === id`) | 12 px SVG spinner (arc, `animateTransform rotate 0→360 dur 0.9s indefinite`), terminal `…` | `suggestion` | Input hidden, `Text dimColor` shows the draft; Open stays |
| Sent · {messageId} | ✓ | `success` | Input hidden; ask line gets `dimColor`; caption "Answered. Waiting for the thread." until the ask hash changes |
| Not sent (Cancel) | – | `subtle` | Input back with the draft kept |
| Changed — refreshed | ↻ | `warning` | card re-renders from the fresh poll; NEW rule applies if still needs-you |
| Busy — try when idle | ● | `warning` | Input disabled-look: replaced by caption until kind leaves busy |
| Unknown — open the thread | ! | `error` | Input hidden; border `error` until the next ask change |
| Open pressed | ↖ | `subtle` | "Click "{title}" in the sidebar" (title as plain Text) |
Notes clear when the reply hash changes. While `sending !== null`, other Inputs stay but submit is a
no-op (as now), with caption `Another answer is sending…` (`subtle`) under them.

## 7. Hover

Card `hover={{ borderColor: accent, borderDimColor: false }}`; inside, `<Box display="none" hover={{
display: 'flex' }}>` reveals full id (`mono`, `caption`) + exact last-activity time. Open is `dimColor`
at rest, full under hover. Nothing actionable is hover-only; no background hovers.

## 8. Quiet cards (collapsed)

One row `<Box key="quiet" flexDirection="row" justifyContent="space-between" paddingX="sm">`:
`<Text color="inactive" size="footnote">◌ 5 quiet threads</Text>` + `<Button key="quiet-toggle"
plain dimColor label={open ? 'Hide' : 'Show'} hotkey="q">`; `open` = new UI atom `quietOpen`.
Expanded: one borderless line each, `<Text size="footnote" color="inactive" wrap="truncate-end">`
title + age + Open. Done cards with no ask use this one-line form too.

## 9. Empty state

Poll ok, no cards: `<Box alignItems="center" paddingY="lg" gap="xs">` with `Svg width={40} height={40}
alt="All clear"` (circle stroke `#3FA66B`, check path drawn in by a one-shot 600 ms
`stroke-dashoffset` animate), `<Text size="heading" weight="semibold">No open threads</Text>`,
`<Text size="caption" color="subtle">New threads appear here within 10 s.</Text>`.
Before the first poll: `<Text color="subtle">Loading threads…</Text>`, never the empty state.

## 10. Terminal fallback (`rich === false`)

Same tree, no `Svg`; `size` is ignored, so hierarchy = `weight` + colour. Accent bar →
`<Text color={accent}>▌</Text>` first in the title row; status bar → chips only; running dot →
`<Text color="suggestion">{'◐◓◑◒'[Math.floor(now/10000)%4]}</Text>` (turns each poll); refresh ring
omitted; spinner → `…`; NEW → chip only. Borders stay; hover is ignored. Mobile (`canType` false):
no Input, caption "Answer from desktop or the thread".

## 11. Open questions (check live in PR 1)

1. Does the `isInteractive` frame honour `prefers-color-scheme`? Yes: add a dark hex set in `<style>`;
   no: keep the mid-tone hexes above, picked to read on both.
2. Does an `Svg` with no `width` stretch to the pane? Yes: drop the fixed 280 px bar width.
3. Does a new `source` restart SMIL, or does the host keep the frame? Ring and bar slide need restart.
4. Do many running-dot frames stutter? If so, report numbers to the owner before choosing a fallback.
