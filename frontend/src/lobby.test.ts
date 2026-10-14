import { test, assert } from 'vitest'
import type { Room } from './lobby'
import { parseRoom, remainingSeconds, closeMessage } from './lobby'
const participant = { id: 'a', name: 'ゲスト', bot: false, guest: true }
const room: Room = {
  type: 'room',
  roomId: 'room-1',
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
