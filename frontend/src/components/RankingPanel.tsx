import type { Ref } from 'react'

export type RankingEntry = { id: string; name: string; rating: number }
export type RankingState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; entries: RankingEntry[] }

type RankingPanelProps = {
  state: RankingState
  currentPlayerId: string | null
  headingRef?: Ref<HTMLHeadingElement>
  onRetry: () => void
}

export default function RankingPanel({
  state,
  currentPlayerId,
  headingRef,
  onRetry,
}: RankingPanelProps) {
  const entries = state.status === 'success' ? state.entries.slice(0, 50) : []
  const ownIndex = entries.findIndex((entry) => entry.id === currentPlayerId)
  return (
    <section
      id="ranking-panel"
      className="ranking-panel"
      aria-labelledby="ranking-heading"
    >
      <div className="ranking-heading">
        <h1 id="ranking-heading" ref={headingRef} tabIndex={-1}>
          ランキング
        </h1>
        <span>TOP 50</span>
      </div>
      <p className="ranking-summary">
        {currentPlayerId === null
          ? 'ゲストで閲覧中'
          : state.status === 'success' && entries.length > 0
            ? ownIndex < 0
              ? 'あなたは50位以内に入っていません'
              : `あなたは ${ownIndex + 1} 位`
            : '総合レートランキング'}
        <small>表示確認用の仮データ</small>
      </p>
      {state.status === 'loading' && (
        <p className="ranking-message" role="status">
          ランキングを読み込み中…
        </p>
      )}
      {state.status === 'error' && (
        <div className="ranking-message">
          <p role="alert">{state.message}</p>
          <button onClick={onRetry}>再読み込み</button>
        </div>
      )}
      {state.status === 'success' && entries.length === 0 && (
        <p className="ranking-message" role="status">
          まだランキングの記録がありません
        </p>
      )}
      {state.status === 'success' && entries.length > 0 && (
        <div
          className="ranking-scroll"
          tabIndex={0}
          role="region"
          aria-label="1位から50位までのランキング一覧"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">順位</th>
                <th scope="col">プレイヤー</th>
                <th scope="col">レート</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr
                  key={entry.id}
                  className={
                    entry.id === currentPlayerId
                      ? 'is-current-player'
                      : undefined
                  }
                  aria-current={
                    entry.id === currentPlayerId ? 'true' : undefined
                  }
                >
                  <td>{index + 1}</td>
                  <td>
                    {entry.name}
                    {entry.id === currentPlayerId && (
                      <span className="ranking-you">あなた</span>
                    )}
                  </td>
                  <td>{entry.rating.toLocaleString('ja-JP')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
