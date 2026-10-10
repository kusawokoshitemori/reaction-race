import type { LoginProvider } from './AuthPanel'

export default function AccountPanel({
  provider,
  onLogout,
}: {
  provider: LoginProvider | null
  onLogout: () => void
}) {
  return (
    <section className="account-card" aria-label="プロフィール">
      <div className="profile-heading">
        <span className="profile-avatar" aria-hidden="true">
          D
        </span>
        <div>
          <p className="auth-eyebrow">PLAYER PROFILE</p>
          <h2>デモプレイヤー</h2>
          <p>{provider ?? 'デモ'}でログイン中</p>
        </div>
      </div>
      <dl className="account-stats">
        <div>
          <dt>レーティング</dt>
          <dd>1,500</dd>
        </div>
        <div>
          <dt>参加した試合</dt>
          <dd>
            12 <small>試合</small>
          </dd>
        </div>
      </dl>
      <p className="auth-demo-note">
        プロフィール・レート・試合数は仮データです。
      </p>
      <div className="account-actions">
        <a className="button" href="#/history">
          戦績を見る <span aria-hidden="true">→</span>
        </a>
        <a className="button secondary" href="#/">
          ゲームに戻る
        </a>
      </div>
      <div className="account-signout">
        <p>またいつでも、挑戦しよう。</p>
        <button className="secondary" onClick={onLogout}>
          ログアウト
        </button>
      </div>
    </section>
  )
}
