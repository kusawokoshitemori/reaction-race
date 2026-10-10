import type { RankingEntry } from './components/RankingPanel'

export const demoRanking: RankingEntry[] = Array.from(
  { length: 50 },
  (_, index) => ({
    id: index === 24 ? 'demo-player' : `player-${index + 1}`,
    name:
      index === 24
        ? 'デモプレイヤー'
        : `プレイヤー${String(index + 1).padStart(2, '0')}`,
    rating: 1980 - index * 20,
  }),
)
