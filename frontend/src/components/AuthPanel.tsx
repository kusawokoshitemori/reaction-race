import { useEffect, useRef, useState } from 'react'

export type LoginProvider = 'Google' | 'X'
type Props = { onLogin: (provider: LoginProvider) => void; onGuest: () => void }

export default function AuthPanel({ onLogin, onGuest }: Props) {
  const [pending, setPending] = useState<LoginProvider | null>(null)
  const [error, setError] = useState('')
  const [simulateFailure, setSimulateFailure] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  function login(provider: LoginProvider) {
    if (timer.current) return
    setError('')
    setPending(provider)
    timer.current = setTimeout(() => {
      timer.current = null
      setPending(null)
      if (simulateFailure)
        setError(
          'ログインできませんでした。もう一度お試しいただくか、ゲストで参加してください。',
        )
      else onLogin(provider)
    }, 800)
  }

  return (
    <section className="auth-layout" aria-label="参加方法を選択">
      <div className="auth-intro">
        <p className="auth-eyebrow">100 PLAYERS / ONE SIGNAL</p>
        <p className="auth-wordmark">
          REACTION
          <br />
          RACE<span aria-hidden="true">↗</span>
        </p>
        <p className="auth-description">
          合図に合わせて、誰よりも速く。
          <br />
          あなたの反応速度を試そう。
        </p>
      </div>
      <div className="auth-card">
        <p className="auth-eyebrow">READY TO RACE?</p>
        <h2>さあ、参加しよう</h2>
        <div className="provider-actions" aria-busy={pending !== null}>
          <button
            className="provider-button google-button"
            disabled={pending !== null}
            onClick={() => login('Google')}
          >
            <span className="provider-mark" aria-hidden="true">
              G
            </span>
            Googleで続ける
          </button>
          <button
            className="provider-button x-button"
            disabled={pending !== null}
            onClick={() => login('X')}
          >
            <span className="provider-mark" aria-hidden="true">
              𝕏
            </span>
            Xで続ける
          </button>
        </div>
        <p className="auth-progress" role="status">
          {pending
            ? `${pending}でログイン中…`
            : 'ログインすると、レート・戦績を記録できます。'}
        </p>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <div className="auth-divider">
          <span>まずは試してみる</span>
        </div>
        <button
          className="guest-button secondary"
          disabled={pending !== null}
          onClick={onGuest}
        >
          ゲストで参加 <span aria-hidden="true">→</span>
        </button>
        <p className="auth-caption">
          登録不要ですぐにプレイ。
          <br />
          ゲストのレート・戦績は保存されません。
        </p>
        {import.meta.env.DEV && (
          <details className="demo-controls">
            <summary>表示確認用</summary>
            <label>
              <input
                type="checkbox"
                checked={simulateFailure}
                disabled={pending !== null}
                onChange={(event) => setSimulateFailure(event.target.checked)}
              />
              ログイン失敗を再現する
            </label>
          </details>
        )}
      </div>
    </section>
  )
}
