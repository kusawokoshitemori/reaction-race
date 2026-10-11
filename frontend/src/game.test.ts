import { test, expect } from 'vitest'
import { judgeInput } from './game'
import { initialSession, transition } from './navigation'
import { createDemoResult, createDemoStandings } from './result'

test('合図前・計測値・受付期限を判定する', () => {
  expect(judgeInput(null, 900)).toEqual({
    outcome: 'flying',
    reactionMs: null,
  })
  expect(judgeInput(1000, 1237.2)).toEqual({
    outcome: 'success',
    reactionMs: 237,
  })
  expect(judgeInput(1000, 3999.9)).toEqual({
    outcome: 'success',
    reactionMs: 2999,
  })
  expect(judgeInput(1000, 4000)).toEqual({
    outcome: 'no-record',
    reactionMs: null,
  })
  expect(judgeInput(1000, 5000)).toEqual({
    outcome: 'no-record',
    reactionMs: null,
  })
})
test('待機・合図中の中断は記録なしになり、確定した入力を上書きしない', () => {
  const ready = transition(transition(initialSession, 'join'), 'start')
  for (const session of [ready, transition(ready, 'signal')]) {
    const canceled = transition(session, 'interrupt')
    expect(canceled.outcome).toBe('no-record')
    expect(transition(canceled, 'finish').result).toBe('no-record')
  }
  const submitted = transition(transition(ready, 'signal'), 'tap')
  expect(transition(submitted, 'interrupt')).toBe(submitted)
})
test('実測値と同タイムを含むモック順位が結果・一覧で一致する', () => {
  for (const ms of [0, 168, 228, 237, 240, 248, 950, 2999]) {
    const result = createDemoResult('success', false, ms)
    const standings = createDemoStandings(result)
    const you = standings.find((entry) => entry.isYou)
    expect(you?.reactionMs).toBe(ms)
    expect(you?.rank).toBe(result.rank)
    expect(standings).toHaveLength(100)
  }
})
