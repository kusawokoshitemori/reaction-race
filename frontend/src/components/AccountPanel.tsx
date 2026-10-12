import { useState } from 'react'
import type { Profile } from '../auth'
import { authErrorMessage } from '../authErrors'

type Props = {
  profile: Profile
  onLogout: () => Promise<unknown>
  onRename: (name: string) => Promise<void>
}
export default function AccountPanel({ profile, onLogout, onRename }: Props) {
  const [name, setName] = useState(profile.displayName)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function run(action: () => Promise<unknown>, success: string) {
    if (pending) return
    setPending(true)
    setError('')
    setMessage('')
    try {
      await action()
      setMessage(success)
    } catch (cause) {
      setError(authErrorMessage(cause))
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="account-card" aria-label="プロフィール">
      <div className="profile-heading">
        <span className="profile-avatar" aria-hidden="true">
          {Array.from(profile.displayName)[0]}
        </span>
        <div>
          <p className="auth-eyebrow">PLAYER PROFILE</p>
          <h2>{profile.displayName}</h2>
          <p>
            {profile.provider === 'google.com' ? 'Google' : 'X'}でログイン中
          </p>
        </div>
      </div>
      <form
        className="profile-form"
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = name.trim()
          if (!trimmed || Array.from(trimmed).length > 30) {
            setError('表示名は1〜30文字で入力してください。')
            return
          }
          void run(() => onRename(trimmed), '表示名を保存しました。')
        }}
      >
        <label htmlFor="display-name">表示名</label>
        <input
          id="display-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          disabled={pending}
          autoComplete="nickname"
          aria-describedby="display-name-hint"
        />
        <small id="display-name-hint">1〜30文字</small>
        <button disabled={pending} type="submit">
          表示名を保存
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <p className="auth-demo-note">
        ゲーム画面のレート・戦績は仮データです。対戦結果の保存は今後対応します。
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
        <button
          className="secondary"
          disabled={pending}
          onClick={() => run(onLogout, '')}
        >
          ログアウト
        </button>
      </div>
    </section>
  )
}
