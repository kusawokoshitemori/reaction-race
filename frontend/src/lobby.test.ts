import { test, assert } from 'vitest'
import type { Room } from './lobby'
import { parseRoom, remainingSeconds, closeMessage, parseTicket } from './lobby'
const participant = { id: 'a', name: 'ゲスト', bot: false, guest: true }
const room: Room = {
  type: 'room',
  roomId: 'room-1',
  you: 'a',
  phase: 'waiting',
  deadline: 11000,
  serverTime: 1000,
  capacity: 100,
  participants: [participant],
}
test('待機通知・100人確定通知を検証する', () => {
  assert.deepEqual(parseRoom(JSON.stringify(room)), room)
  const locked = {
    ...room,
    phase: 'locked',
    you: '0',
    participants: Array.from({ length: 100 }, (_, i) => ({
      ...participant,
      id: String(i),
      bot: i !== 0,
    })),
  }
  assert.equal(parseRoom(JSON.stringify(locked)).participants.length, 100)
  for (const invalid of [
    { ...room, phase: 'locked' },
    { ...room, capacity: 99 },
    { ...room, participants: [participant, participant] },
    { ...room, participants: [{ id: 'a' }] },
    { ...room, phase: 'signal' },
    null,
  ]) {
    assert.throws(() => parseRoom(JSON.stringify(invalid)))
  }
})
test('カウントダウンはサーバー時刻と受信後の経過時間を使い、0でも勝手に開始しない', () => {
  assert.equal(remainingSeconds(room, 0), 10)
  assert.equal(remainingSeconds(room, 1501), 9)
  assert.equal(remainingSeconds(room, 10001), 0)
  assert.equal(room.phase, 'waiting')
})
test('二重参加と切断を利用者へ説明する', () => {
  assert.match(closeMessage('already_connected'), /別のタブ/)
  assert.match(closeMessage('room_closed'), /終了/)
  assert.match(closeMessage(''), /再試行/)
})

test('チケットをunknownから検証し、不正なレスポンスを拒否する', () => {
  assert.equal(parseTicket({ ticket: 'a'.repeat(64) }), 'a'.repeat(64))
  for (const value of [
    null,
    [],
    'ticket',
    {},
    { ticket: 123 },
    { ticket: 'a'.repeat(63) },
    { ticket: 'a'.repeat(65) },
    { ticket: 'z'.repeat(64) },
  ]) {
    assert.throws(() => parseTicket(value))
  }
  assert.match(closeMessage('already_connected'), /直前の接続/)
  assert.match(closeMessage('already_connected'), /しばらく待って/)
})

test('試合通知と自分の受付確認を検証し、不完全な結果を拒否する', () => {
  const participants = Array.from({ length: 100 }, (_, i) => ({
    ...participant,
    id: String(i),
  }))
  const signal = {
    ...room,
    you: '0',
    phase: 'signal',
    matchId: 'match-1',
    signalAt: 1000,
    deadline: 4000,
    participants,
  }
  assert.equal(parseRoom(JSON.stringify(signal)).phase, 'signal')
  const results = participants.map((p) => ({
    participantId: p.id,
    outcome: 'no-record',
    reactionMs: null,
  }))
  const finished = { ...signal, phase: 'finished', results }
  assert.equal(parseRoom(JSON.stringify(finished)).results?.length, 100)
  for (const invalid of [
    { ...signal, you: 'unknown' },
    { ...signal, matchId: '' },
    { ...signal, deadline: 4001 },
    {
      ...signal,
      input: { participantId: '1', outcome: 'success', reactionMs: 200 },
    },
    {
      ...signal,
      input: { participantId: '0', outcome: 'success', reactionMs: 3000 },
    },
    { ...finished, results: results.slice(1) },
    { ...finished, results: results.map(() => results[0]) },
  ])
    assert.throws(() => parseRoom(JSON.stringify(invalid)))
})
