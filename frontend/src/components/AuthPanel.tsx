import { useRef, useState } from 'react'
import type { LoginProvider } from '../auth'
import { authDiagnostic, authErrorMessage } from '../authErrors'
type Props = {
  onLogin: (provider: LoginProvider) => Promise<unknown>
  onGuest: () => Promise<unknown>
  disabled?: boolean
}

export default function AuthPanel({
  onLogin,
  onGuest,
  disabled = false,
}: Props) {
  const [pending, setPending] = useState<LoginProvider | 'ゲスト' | null>(null)
  const [error, setError] = useState('')
  const [diagnostic, setDiagnostic] = useState('')
  const inFlight = useRef(false)

  async function login(provider: LoginProvider | 'ゲスト') {
    if (inFlight.current || disabled) return
    inFlight.current = true
    setError('')
    setDiagnostic('')
    setPending(provider)
    try {
      await (provider === 'ゲスト' ? onGuest() : onLogin(provider))
    } catch (cause) {
      setError(authErrorMessage(cause))
      setDiagnostic(authDiagnostic(cause))
    } finally {
      inFlight.current = false
      setPending(null)
    }
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
            disabled={disabled || pending !== null}
            onClick={() => login('Google')}
          >
            <span className="provider-mark" aria-hidden="true">
              G
            </span>
            Googleで続ける
          </button>
          <button
            className="provider-button x-button"
            disabled={disabled || pending !== null}
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
        {import.meta.env.DEV && error && (
          <p className="auth-caption">診断コード: {diagnostic}</p>
        )}
        <div className="auth-divider">
          <span>まずは試してみる</span>
        </div>
        <button
          className="guest-button secondary"
          disabled={disabled || pending !== null}
          onClick={() => login('ゲスト')}
        >
          ゲストで参加 <span aria-hidden="true">→</span>
        </button>
        <p className="auth-caption">
          登録不要ですぐにプレイ。
          <br />
          ゲストのレート・戦績は保存されません。
        </p>
      </div>
    </section>
  )
}
