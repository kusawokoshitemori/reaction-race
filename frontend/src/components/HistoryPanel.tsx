import { useEffect, useRef, useState } from 'react'
import { isHistory, isDetail, useRecords } from '../records'
import type { ReaderUser, RecordEntry } from '../records'
function Outcome({ entry }: { entry: RecordEntry }) {
  const delta =
    entry.ratingAfter !== null && entry.ratingBefore !== null
      ? entry.ratingAfter - entry.ratingBefore
      : null
  return (
    <>
      <strong>
        {entry.outcome === 'flying'
          ? 'フライング'
          : entry.outcome === 'no-record'
            ? '未入力'
            : entry.rank === null
              ? '参考記録（順位対象外）'
              : `${entry.rank}位`}
      </strong>
      <span>
        {entry.reactionMs === null ? '記録なし' : `${entry.reactionMs} ms`}
      </span>
      <span>
        {delta === null
          ? 'レートなし'
          : `レート ${delta >= 0 ? '+' : ''}${delta}（${entry.ratingBefore} → ${entry.ratingAfter}）`}
      </span>
    </>
  )
}
function MatchDetail({
  user,
  id,
  onBack,
}: {
  user: ReaderUser
  id: string
  onBack: () => void
}) {
  const { data, error, retry } = useRecords(
    user,
    `/api/matches/${encodeURIComponent(id)}`,
    isDetail,
  )
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  return (
    <>
      <button onClick={onBack}>戦績一覧へ戻る</button>
      <h3 tabIndex={-1} ref={heading}>
        保存済みの試合結果
      </h3>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button onClick={retry}>再読み込み</button>
        </>
      ) : !data ? (
        <p role="status">試合結果を読み込み中…</p>
      ) : (
        <>
          <p>{new Date(data.finishedAt).toLocaleString('ja-JP')}</p>
          {data.entries.length === 0 && (
            <p role="status">この試合の参加者記録はありません</p>
          )}
          <ul className="history-list">
            {data.entries.map((e) => (
              <li key={e.participantId}>
                <span>
                  {e.name}
                  {e.bot ? '（BOT）' : e.guest ? '（ゲスト）' : ''}
                </span>
                <Outcome entry={e} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
export default function HistoryPanel({ user }: { user: ReaderUser }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const { data, error, retry } = useRecords(
    user,
    `/api/me/history?offset=${offset}`,
    isHistory,
  )
  const previous = useRef({ selected, offset })
  useEffect(() => {
    if (
      selected === null &&
      (previous.current.selected !== null || previous.current.offset !== offset)
    )
      heading.current?.focus()
    previous.current = { selected, offset }
  }, [selected, offset])
  return (
    <section className="account-card" aria-label="プレイヤーの戦績">
      <h2 ref={heading} tabIndex={-1}>
        あなたの戦績
      </h2>
      {selected ? (
        <MatchDetail
          user={user}
          id={selected}
          onBack={() => setSelected(null)}
        />
      ) : (
        <>
          {error ? (
            <>
              <p role="alert">{error}</p>
              <button onClick={retry}>再読み込み</button>
            </>
          ) : !data ? (
            <p role="status">戦績を読み込み中…</p>
          ) : (
            <>
              {data.entries.length === 0 ? (
                <p role="status">まだ戦績がありません</p>
              ) : (
                <ul className="history-list">
                  {data.entries.map((e) => (
                    <li key={e.matchId}>
                      <span>
                        {new Date(e.finishedAt).toLocaleString('ja-JP')}
                      </span>
                      <Outcome entry={e} />
                      <button onClick={() => setSelected(e.matchId)}>
                        試合詳細を見る
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <nav aria-label="戦績のページ">
                <button
                  disabled={offset === 0}
                  onClick={() => setOffset((n) => Math.max(0, n - 20))}
                >
                  前の20件
                </button>
                <button
                  disabled={!data.hasMore}
                  onClick={() => setOffset((n) => n + 20)}
                >
                  次の20件
                </button>
              </nav>
            </>
          )}
        </>
      )}
      <a href="#/auth">アカウントに戻る</a>
    </section>
  )
}
