import { useRef } from 'react'
import { createDemoStandings, formatRatingDelta, resultCopy } from '../result'
import type { MatchResult, MatchStanding } from '../result'

type ResultPanelProps = {
  result: MatchResult
  standings?: MatchStanding[]
  onRematch: () => void
}

export default function ResultPanel({
  result,
  standings: serverStandings,
  onRematch,
}: ResultPanelProps) {
  const copy = resultCopy[result.outcome]
  const delta = result.rating
    ? result.rating.after - result.rating.before
    : null
  const standings = serverStandings ?? createDemoStandings(result)
  const firstRow = useRef<HTMLTableRowElement>(null)
  const yourRow = useRef<HTMLTableRowElement>(null)

  function revealRow(row: HTMLTableRowElement | null) {
    row?.scrollIntoView({ block: 'center', behavior: 'instant' })
    row?.focus({ preventScroll: true })
  }

  return (
    <section className="result-panel" aria-labelledby="result-summary-heading">
      <div className={`result-card is-${result.outcome}`}>
        <div className="result-card-heading">
          <h2 id="result-summary-heading">あなたの結果</h2>
          <span className="result-status">{copy.label}</span>
        </div>
        {copy.description && (
          <p className="result-description">{copy.description}</p>
        )}
        <dl className="result-metrics">
          <div>
            <dt>今回の順位</dt>
            <dd>
              {result.rank === null ? (
                <strong className="result-empty">
                  {serverStandings && result.outcome === 'success'
                    ? '参考記録'
                    : '順位なし'}
                </strong>
              ) : (
                <>
                  <strong>{result.rank}</strong>
                  <span>位</span>
                </>
              )}
              <small>参加者 {result.participants}人</small>
            </dd>
          </div>
          <div>
            <dt>反応時間</dt>
            <dd>
              {result.reactionMs === null ? (
                <strong className="result-empty">記録なし</strong>
              ) : (
                <>
                  <strong>{result.reactionMs}</strong>
                  <span>ms</span>
                </>
              )}
              <small>
                {result.outcome === 'success'
                  ? serverStandings
                    ? result.measurement === 'corrected'
                      ? '通信遅延を補正した記録'
                      : '補正できないため順位対象外'
                    : '今回の記録'
                  : '有効な入力がありません'}
              </small>
            </dd>
          </div>
        </dl>
        <div className="result-rating">
          <span>レート変動</span>
          {result.rating && delta !== null ? (
            <div>
              <strong
                className={
                  delta > 0 ? 'is-positive' : delta < 0 ? 'is-negative' : ''
                }
              >
                {formatRatingDelta(delta)}
              </strong>
              <span
                className="result-rating-transition"
                aria-label={`レート ${result.rating.before}から${result.rating.after}`}
              >
                {result.rating.before.toLocaleString('ja-JP')}{' '}
                <span aria-hidden="true">→</span>{' '}
                {result.rating.after.toLocaleString('ja-JP')}
              </span>
            </div>
          ) : (
            <p>
              {serverStandings && !result.guest ? 'レート未確定' : 'レートなし'}
              <small>
                {serverStandings
                  ? result.guest
                    ? 'ゲストにはレートがありません'
                    : '保存完了後に確定値を表示します'
                  : 'ゲストにはレートがありません'}
              </small>
            </p>
          )}
        </div>
      </div>
      {result.persistence && (
        <p role="status">
          {result.persistence === 'saved'
            ? '結果を保存しました。'
            : result.persistence === 'failed'
              ? '結果の保存に失敗しました。自動再試行を終了しました。レートは未確定です。'
              : result.persistence === 'retrying'
                ? '結果を保存できませんでした。自動で再試行しています。レートはまだ確定していません。'
                : '結果を保存しています…'}
        </p>
      )}
      {serverStandings &&
        result.outcome === 'success' &&
        result.rank === null && <p>参考記録のため、レートは変動しません。</p>}
      <p className="result-demo-note">
        {serverStandings
          ? '通信遅延を補正して順位を決定します。同タイムは同順位です。計測不足・不安定な回線の記録は順位対象外です。端末の描画・入力遅延は補正できません。'
          : '自分の反応時間はブラウザでの実測値です。他の参加者・順位・レートはモックで、保存はされません。'}
      </p>
      <div className="result-actions">
        <button onClick={onRematch}>
          再戦 <span aria-hidden="true">→</span>
        </button>
        <a className="button secondary" href="#/">
          タイトルに戻る
        </a>
      </div>
      <section
        className="match-standings"
        aria-labelledby="match-standings-heading"
      >
        <div className="match-standings-heading">
          <h2 id="match-standings-heading">
            {serverStandings ? '参加者の結果' : '今回のランキング'}{' '}
            <small>{result.participants}人</small>
          </h2>
          <div className="match-standings-jumps">
            <button
              className="secondary"
              onClick={() => revealRow(firstRow.current)}
            >
              {serverStandings ? '先頭へ' : '1位へ'}
            </button>
            <button
              className="secondary"
              onClick={() => revealRow(yourRow.current)}
            >
              自分へ
            </button>
          </div>
        </div>
        <div
          className="match-standings-scroll"
          role="region"
          aria-label="今回の参加者の順位と反応時間"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">順位</th>
                <th scope="col">プレイヤー</th>
                <th scope="col">反応時間</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((entry, index) => (
                <tr
                  key={entry.id}
                  ref={
                    entry.isYou ? yourRow : index === 0 ? firstRow : undefined
                  }
                  tabIndex={-1}
                  className={`${entry.isYou ? 'is-you ' : ''}${entry.rank !== null && entry.rank <= 3 ? `podium-${entry.rank}` : ''}`}
                >
                  <td>{entry.rank ?? '—'}</td>
                  <td>
                    {entry.name}
                    {entry.isYou && (
                      <span className="match-you-label">あなた</span>
                    )}
                  </td>
                  <td>
                    {entry.reactionMs !== null ? (
                      <>
                        {entry.reactionMs}
                        <small> ms</small>
                      </>
                    ) : (
                      <span className="match-no-record">
                        {resultCopy[entry.outcome].label}
                        <small>記録なし</small>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
