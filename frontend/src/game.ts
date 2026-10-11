export const INPUT_WINDOW_MS = 3000

// Null means the signal has not been committed yet. The first input wins.
export function judgeInput(signalAt: number | null, now: number) {
  if (signalAt === null) return { outcome: 'flying' as const, reactionMs: null }
  const elapsed = Math.max(0, now - signalAt)
  return elapsed >= INPUT_WINDOW_MS
    ? { outcome: 'no-record' as const, reactionMs: null }
    : {
        outcome: 'success' as const,
        reactionMs: Math.min(INPUT_WINDOW_MS - 1, Math.round(elapsed)),
      }
}
