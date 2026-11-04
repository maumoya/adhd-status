// Shapes the thread deck passes between its pure parts and the pane.
export type Kind = 'needs-you' | 'unclear' | 'busy' | 'done' | 'quiet'

export type Thread = {
  id: string
  title: string
  isRunning: boolean
  prNumber: number | null
  prState: string | null
  lastActivityAt: string
}

export type Card = Thread & { kind: Kind; ask: string; extra: number; replyHash: string }
