export type Participant = {
  id: string
  name: string
  bot: boolean
  guest: boolean
}
export type Room = {
  type: 'room'
  roomId: string
  phase: 'waiting' | 'locked'
  deadline: number
  serverTime: number
  capacity: number
  participants: Participant[]
}
export type LobbyState = {
  status: 'connecting' | 'connected' | 'error'
  room: Room | null
  error: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
function isParticipant(value: unknown): value is Participant {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    typeof value.bot === 'boolean' &&
    typeof value.guest === 'boolean'
  )
}
export function parseRoom(data: string): Room {
  const r: unknown = JSON.parse(data)
  if (
    !isRecord(r) ||
    r.type !== 'room' ||
    typeof r.roomId !== 'string' ||
    !r.roomId ||
    (r.phase !== 'waiting' && r.phase !== 'locked') ||
    r.capacity !== 100 ||
    typeof r.deadline !== 'number' ||
    !Number.isFinite(r.deadline) ||
    typeof r.serverTime !== 'number' ||
    !Number.isFinite(r.serverTime) ||
    !Array.isArray(r.participants) ||
    !r.participants.every(isParticipant) ||
    r.participants.length < 1 ||
    r.participants.length > 100 ||
    (r.phase === 'locked' && r.participants.length !== 100) ||
    new Set(r.participants.map((p) => p.id)).size !== r.participants.length
  )
    throw new Error('invalid room')
  return {
    type: 'room',
    roomId: r.roomId,
    phase: r.phase,
    capacity: 100,
    deadline: r.deadline,
    serverTime: r.serverTime,
    participants: r.participants,
  }
}
export function remainingSeconds(room: Room, elapsedMs: number) {
  return Math.max(
    0,
    Math.ceil((room.deadline - room.serverTime - elapsedMs) / 1000),
  )
}
export function closeMessage(reason: string) {
  if (reason === 'already_connected')
    return '別のタブで参加中です。そのタブを閉じてから再試行してください。'
  if (reason === 'room_closed')
    return '待機室の接続が終了しました。もう一度参加できます。'
  return '接続が切れました。通信環境を確認して再試行してください。'
}
