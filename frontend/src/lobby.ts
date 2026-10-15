export type Participant = {
  id: string
  name: string
  bot: boolean
  guest: boolean
}
export type ServerInput = { participantId: string; receivedAt?: number } & (
  | { outcome: 'success'; reactionMs: number }
  | { outcome: 'flying' | 'no-record'; reactionMs: null }
)
export type Room = {
  type: 'room'
  roomId: string
  phase: 'waiting' | 'locked' | 'ready' | 'signal' | 'settling' | 'finished'
  you: string
  matchId?: string
  signalAt?: number
  input?: ServerInput
  results?: ServerInput[]
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
function isInput(value: unknown): value is ServerInput {
  return (
    isRecord(value) &&
    typeof value.participantId === 'string' &&
    (value.receivedAt === undefined ||
      (typeof value.receivedAt === 'number' &&
        Number.isFinite(value.receivedAt))) &&
    (value.outcome === 'success'
      ? typeof value.reactionMs === 'number' &&
        Number.isInteger(value.reactionMs) &&
        value.reactionMs >= 0 &&
        value.reactionMs < 3000
      : (value.outcome === 'flying' || value.outcome === 'no-record') &&
        value.reactionMs === null)
  )
}
export function parseRoom(data: string): Room {
  const r: unknown = JSON.parse(data)
  if (
    !isRecord(r) ||
    r.type !== 'room' ||
    typeof r.roomId !== 'string' ||
    !r.roomId ||
    (r.phase !== 'waiting' &&
      r.phase !== 'locked' &&
      r.phase !== 'ready' &&
      r.phase !== 'signal' &&
      r.phase !== 'settling' &&
      r.phase !== 'finished') ||
    r.capacity !== 100 ||
    typeof r.deadline !== 'number' ||
    !Number.isFinite(r.deadline) ||
    typeof r.serverTime !== 'number' ||
    !Number.isFinite(r.serverTime) ||
    !Array.isArray(r.participants) ||
    !r.participants.every(isParticipant) ||
    r.participants.length < 1 ||
    r.participants.length > 100 ||
    (r.phase !== 'waiting' && r.participants.length !== 100) ||
    new Set(r.participants.map((p) => p.id)).size !== r.participants.length
  )
    throw new Error('invalid room')
  const participants = r.participants
  if (typeof r.you !== 'string' || !participants.some((p) => p.id === r.you))
    throw new Error('invalid self')
  if (r.matchId !== undefined && typeof r.matchId !== 'string')
    throw new Error('invalid match')
  if (
    ['ready', 'signal', 'settling', 'finished'].includes(r.phase) &&
    !r.matchId
  )
    throw new Error('missing match')
  if (
    r.signalAt !== undefined &&
    (typeof r.signalAt !== 'number' || !Number.isFinite(r.signalAt))
  )
    throw new Error('invalid signal')
  if (
    r.phase === 'signal' &&
    (typeof r.signalAt !== 'number' || r.deadline !== r.signalAt + 3000)
  )
    throw new Error('invalid deadline')
  if (
    r.input !== undefined &&
    (!isInput(r.input) || r.input.participantId !== r.you)
  )
    throw new Error('invalid input')
  if (
    r.results !== undefined &&
    (!Array.isArray(r.results) ||
      !r.results.every(isInput) ||
      r.results.some(
        (input) => !participants.some((p) => p.id === input.participantId),
      ) ||
      new Set(r.results.map((input) => input.participantId)).size !==
        r.results.length)
  )
    throw new Error('invalid results')
  if (
    r.phase === 'finished' &&
    (!Array.isArray(r.results) || r.results.length !== 100)
  )
    throw new Error('incomplete results')
  return {
    type: 'room',
    you: r.you,
    ...(typeof r.matchId === 'string' ? { matchId: r.matchId } : {}),
    ...(typeof r.signalAt === 'number' ? { signalAt: r.signalAt } : {}),
    ...(isInput(r.input) ? { input: r.input } : {}),
    ...(Array.isArray(r.results) && r.results.every(isInput)
      ? { results: r.results }
      : {}),
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
    return '別のタブまたは直前の接続が残っています。別のタブで参加中なら退出し、回線が切れた場合はしばらく待って再試行してください。'
  if (reason === 'room_closed')
    return '待機室の接続が終了しました。もう一度参加できます。'
  return '接続が切れました。通信環境を確認して再試行してください。'
}

export function parseTicket(data: unknown): string {
  if (
    !isRecord(data) ||
    typeof data.ticket !== 'string' ||
    !/^[a-f0-9]{64}$/.test(data.ticket)
  )
    throw new Error('ticket invalid')
  return data.ticket
}
