import type { Outcome } from './navigation'

export type MatchResult = {
  participants: number
  rating: { before: number; after: number } | null
} & (
  | { outcome: 'success'; rank: number; reactionMs: number }
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

// UI確認用の固定値。結果通知との接続時にサーバーの確定結果へ置き換える。
export function createDemoResult(
  outcome: Outcome,
  signedIn: boolean,
): MatchResult {
  const shared = {
    participants: 100,
    rating: signedIn
      ? { before: 1500, after: outcome === 'success' ? 1506 : 1493 }
      : null,
  }
  return outcome === 'success'
    ? { ...shared, outcome, rank: 12, reactionMs: 240 }
    : { ...shared, outcome, rank: null, reactionMs: null }
}

export function formatRatingDelta(delta: number): string {
  return delta === 0 ? '±0' : delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`
}

export type MatchStanding = { id: string; name: string; isYou: boolean } & (
  | { outcome: 'success'; rank: number; reactionMs: number }
  | { outcome: 'flying' | 'no-record'; rank: null; reactionMs: null }
)

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
        reactionMs: index < 11 ? 168 + index * 6 : 248 + (index - 11) * 9,
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
