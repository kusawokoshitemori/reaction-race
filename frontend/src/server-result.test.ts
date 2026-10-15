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

test('補正後の時間と同順位をサーバーから引き継ぎ、参考記録を末尾に置く', () => {
  const room: Room = {
    type: 'room',
    roomId: 'r',
    matchId: 'm',
    phase: 'finished',
    capacity: 4,
    you: 'b',
    deadline: 4000,
    serverTime: 6000,
    participants: ['a', 'b', 'c', 'd'].map((id) => ({
      id,
      name: id,
      bot: false,
      guest: true,
    })),
    results: [
      { participantId: 'd', outcome: 'flying', reactionMs: null },
      {
        participantId: 'c',
        outcome: 'success',
        reactionMs: 150,
        measurement: 'unavailable',
        rank: null,
      },
      {
        participantId: 'a',
        outcome: 'success',
        reactionMs: 200,
        rawReactionMs: 220,
        correctionMs: 20,
        measurement: 'corrected',
        rank: 1,
      },
      {
        participantId: 'b',
        outcome: 'success',
        reactionMs: 200,
        rawReactionMs: 380,
        correctionMs: 180,
        measurement: 'corrected',
        rank: 1,
      },
    ],
  }
  const { result, standings } = serverResult(room)
  expect(result).toMatchObject({
    rank: 1,
    reactionMs: 200,
    measurement: 'corrected',
    rating: null,
  })
  expect(standings.map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd'])
  expect(standings.map((entry) => entry.rank)).toEqual([1, 1, null, null])
})
