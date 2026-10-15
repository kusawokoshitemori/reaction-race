import { useState } from 'react'
import type { MatchResult } from '../result'
const outcomes = {
  flying: 'フライング・記録なし',
  'no-record': '未入力・記録なし',
}
export default function HistoryPanel({
  result,
}: {
  result: MatchResult | null
}) {
  const [empty, setEmpty] = useState(false)
  return (
    <section className="account-card" aria-label="プレイヤーの戦績">
      <h2>デモプレイヤーの戦績</h2>
      <p className="auth-demo-note">画面確認用の仮データです。</p>
      {empty ? (
        <div className="history-empty">
          <h3>まだ戦績がありません</h3>
          <p>最初のレースに参加してみましょう。</p>
          <a className="button" href="#/">
            ゲームへ
          </a>
        </div>
      ) : (
        <ul className="history-list">
          <li>
            <span>サンプル試合</span>
            <strong>12位 / 100人</strong>
            <span>
              240 ms <small>レート +6</small>
            </span>
          </li>
          {result && (
            <li>
              <span>今回の試合（未保存）</span>
              <strong>
                {result.outcome === 'success'
                  ? `${result.rank === null ? '順位未計算' : `${result.rank}位`} / ${result.participants}人・${result.reactionMs} ms`
                  : outcomes[result.outcome]}
              </strong>
              <a href="#/result">試合結果を見る →</a>
            </li>
          )}
        </ul>
      )}
      <a href="#/auth">アカウントに戻る</a>
      {import.meta.env.DEV && (
        <details className="demo-controls">
          <summary>表示確認用</summary>
          <label>
            <input
              type="checkbox"
              checked={empty}
              onChange={(event) => setEmpty(event.target.checked)}
            />
            戦績なしを表示する
          </label>
        </details>
      )}
    </section>
  )
}
