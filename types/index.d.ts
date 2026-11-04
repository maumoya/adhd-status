// State the thread deck keeps, per session, in plugin adhd-status.
export type DeckCard = {
  id: string
  title: string
  isRunning: boolean
  prNumber: number | null
  prState: string | null
  lastActivityAt: string
  kind: 'needs-you' | 'unclear' | 'busy' | 'done' | 'quiet'
  ask: string
  extra: number
  replyHash: string
}

declare module 'claude-code' {
  interface PluginState {
    'adhd-status': {
      cards: Shaped<DeckCard[]>
      polledAt: Shaped<number>
      pollError: Shaped<string>
      frozen: Shaped<string[] | null>
      drafts: Shaped<Record<string, string>>
      sending: Shaped<string | null>
      notes: Shaped<Record<string, string>>
      answered: Shaped<Record<string, string>>
      lastInput: Shaped<number>
      paused: Shaped<boolean>
      quietOpen: Shaped<boolean>
      firstNeedsAt: Shaped<Record<string, number>>
      prevCounts: Shaped<Record<DeckCard['kind'], number> | null>
      noteSeen: Shaped<Record<string, string>>
    }
  }
}
