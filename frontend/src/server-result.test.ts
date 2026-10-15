import { test, expect } from 'vitest'
import { serverResult } from './result'
import type { Room, ServerInput } from './lobby'

test('サーバーの実参加者と結果を使い、未計算の順位・レートを表示しない', () => {
  const inputs: ServerInput[] = [
    { participantId: 'a', outcome: 'success', reactionMs: 123 },
    { participantId: 'a', outcome: 'flying', reactionMs: null },
    { participantId: 'a', outcome: 'no-record', reactionMs: null },
  ]
  for (const input of inputs) {
    const room: Room = {
      type: 'room',
      roomId: 'r',
      matchId: 'm',
      phase: 'finished',
      capacity: 1,
      you: 'a',
      deadline: 4000,
      serverTime: 4000,
      participants: [{ id: 'a', name: '本人', bot: false, guest: true }],
      results: [input],
    }
    const { result, standings } = serverResult(room)
    expect(result.outcome).toBe(input.outcome)
    expect(result.rank).toBeNull()
    expect(result.rating).toBeNull()
    expect(standings[0]?.name).toBe('本人')
    expect(standings[0]?.isYou).toBe(true)
    expect(standings[0]?.reactionMs).toBe(input.reactionMs)
    expect(() => serverResult({ ...room, phase: 'signal' })).toThrow()
  }
})
