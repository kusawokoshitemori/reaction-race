import type { Outcome } from './navigation'
import type { Measurement, Persistence } from './lobby'

export type MatchResult = {
  matchId?: string
  persistence?: Persistence
  guest?: boolean
  measurement?: Measurement
  participants: number
  rating: { before: number; after: number } | null
} & (
  | { outcome: 'success'; rank: number | null; reactionMs: number }
  | { outcome: 'flying' | 'no-record'; rank: null; reactionMs: null }
)

export const resultCopy: Record<
  Outcome,
  { label: string; description: string }
> = {
  success: { label: '成功', description: '' },
  flying: {
    label: 'フライング',
    description: '合図より前に入力しました。次は合図を待って押しましょう。',
  },
  'no-record': {
    label: '未入力',
    description: '制限時間内に入力がなかったため、記録はありません。',
  },
}

// 自分の計測値と固定のモック対戦相手を比較。通信接続時はサーバー確定結果へ置き換える。
export function createDemoResult(
  outcome: Outcome,
  signedIn: boolean,
  measuredMs = 240,
): MatchResult {
  const shared = {
    participants: 100,
    rating: signedIn
      ? { before: 1500, after: outcome === 'success' ? 1506 : 1493 }
      : null,
  }
  return outcome === 'success'
    ? {
        ...shared,
        outcome,
        rank:
          1 +
          Array.from({ length: 90 }, (_, index) => demoTime(index)).filter(
            (time) => time <= measuredMs,
          ).length,
        reactionMs: measuredMs,
      }
    : { ...shared, outcome, rank: null, reactionMs: null }
}

export function formatRatingDelta(delta: number): string {
  return delta === 0 ? '±0' : delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`
}

export type MatchStanding = {
  measurement?: Measurement
  id: string
  name: string
  isYou: boolean
} & (
  | { outcome: 'success'; rank: number | null; reactionMs: number }
  | { outcome: 'flying' | 'no-record'; rank: null; reactionMs: null }
)

function demoTime(index: number) {
  return index < 11 ? 168 + index * 6 : 248 + (index - 11) * 9
}

export function createDemoStandings(result: MatchResult): MatchStanding[] {
  const names = [
    'はやぶさ',
    'mikan',
    'しろくま',
    'そら',
    'もなか',
    'Rin',
    'こはく',
    'なぎ',
    'ペンギン',
    'ゆず',
    'ao',
  ]
  const entries: MatchStanding[] = Array.from(
    { length: result.participants - 1 },
    (_, index) => {
      const place = index + 1
      const player = {
        id: `demo-${place}`,
        name: names[index] ?? `プレイヤー${String(place).padStart(2, '0')}`,
        isYou: false,
      }
      if (place > 94)
        return { ...player, outcome: 'no-record', rank: null, reactionMs: null }
      if (place > 90)
        return { ...player, outcome: 'flying', rank: null, reactionMs: null }
      return {
        ...player,
        outcome: 'success',
        rank: place,
        reactionMs: demoTime(index),
      }
    },
  )
  const you = {
    id: 'you',
    name: result.rating ? 'デモプレイヤー' : 'ゲスト',
    isYou: true,
  }
  entries.push(
    result.outcome === 'success'
      ? {
          ...you,
          outcome: 'success',
          rank: result.rank,
          reactionMs: result.reactionMs,
        }
      : { ...you, outcome: result.outcome, rank: null, reactionMs: null },
  )
  const order = { success: 0, flying: 1, 'no-record': 2 }
  entries.sort(
    (a, b) =>
      order[a.outcome] - order[b.outcome] ||
      (a.reactionMs ?? 0) - (b.reactionMs ?? 0),
  )
  return entries.map((entry, index) =>
    entry.outcome === 'success' ? { ...entry, rank: index + 1 } : entry,
  )
}

// Use the server's corrected result and competition rank without recomputing them.
export function serverResult(room: import('./lobby').Room): {
  result: MatchResult
  standings: MatchStanding[]
} {
  if (room.phase !== 'finished' || !room.results)
    throw new Error('unfinished match')
  const own = room.results.find((input) => input.participantId === room.you)
  if (!own) throw new Error('missing result')
  const standings: MatchStanding[] = room.results.map((input) => {
    const participant = room.participants.find(
      (p) => p.id === input.participantId,
    )
    if (!participant) throw new Error('missing participant')
    const player = {
      measurement: input.measurement,
      id: input.participantId,
      name: participant.name,
      isYou: input.participantId === room.you,
      rank: null,
    }
    return input.outcome === 'success'
      ? {
          ...player,
          rank: input.rank ?? null,
          outcome: input.outcome,
          reactionMs: input.reactionMs,
        }
      : { ...player, outcome: input.outcome, reactionMs: null }
  })
  standings.sort(
    (a, b) =>
      (a.rank ?? (a.outcome === 'success' ? 101 : 102)) -
      (b.rank ?? (b.outcome === 'success' ? 101 : 102)),
  )
  const shared = {
    participants: room.capacity,
    matchId: room.matchId,
    persistence: room.persistence,
    guest: room.participants.find((p) => p.id === room.you)?.guest ?? true,
    rating: room.persistence === 'saved' ? (own.rating ?? null) : null,
    rank: null,
    measurement: own.measurement,
  }
  const result: MatchResult =
    own.outcome === 'success'
      ? {
          ...shared,
          rank: own.rank ?? null,
          outcome: own.outcome,
          reactionMs: own.reactionMs,
        }
      : { ...shared, outcome: own.outcome, reactionMs: null }
  return { result, standings }
}
