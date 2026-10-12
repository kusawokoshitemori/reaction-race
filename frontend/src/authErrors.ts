// Only expose a bounded error code and known categories, never raw SDK errors.
export function authDiagnostic(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'unknown'
  const rawCode = 'code' in error ? error.code : ''
  const code =
    typeof rawCode === 'string' && /^(auth|api)\/[a-z-]{1,80}$/.test(rawCode)
      ? rawCode
      : 'unknown'
  const message =
    'message' in error && typeof error.message === 'string' ? error.message : ''
  let reason = ''
  if (
    /callback.*(?:not approved|not allowed|invalid)|(?:invalid|unapproved).*callback/i.test(
      message,
    )
  )
    reason = 'callback-url-rejected'
  else if (
    /could not authenticate you|invalid (?:consumer|api) key|invalid signature|bad authentication data/i.test(
      message,
    )
  )
    reason = 'provider-credentials-rejected'
  else if (/request_token/i.test(message))
    reason = 'provider-request-token-failed'
  return reason ? `${code} / ${reason}` : code
}

export function authErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : ''
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'ログインをキャンセルしました。もう一度お試しいただけます。'
    case 'auth/popup-blocked':
      return 'ポップアップがブロックされました。このサイトのポップアップを許可して、もう一度お試しください。'
    case 'auth/cancelled-popup-request':
      return '別のログイン処理が進行中です。'
    case 'auth/account-exists-with-different-credential':
      return 'このメールアドレスは別のログイン方法で登録済みです。以前使用した方法でログインしてください。'
    case 'auth/network-request-failed':
      return '通信できませんでした。接続を確認して、もう一度お試しください。'
    case 'auth/operation-not-allowed':
      return 'このログイン方法は現在利用できません。'
    case 'auth/unauthorized-domain':
      return 'このドメインではログインが許可されていません。'
    case 'auth/internal-error':
      return '認証サービスとの連携でエラーが発生しました。設定またはサービスの状態を確認してください。'
    case 'auth/invalid-credential':
      return '認証情報を確認できませんでした。ログインをやり直してください。'
    case 'auth/configuration-missing':
      return '認証の設定がまだ完了していません。'
    case 'api/unavailable':
      return 'プロフィールを取得・保存できませんでした。時間をおいて再度お試しください。'
    case 'api/unauthorized':
      return 'ログインの有効期限が切れました。一度ログアウトして再度ログインしてください。'
    default:
      return 'ログイン処理に失敗しました。もう一度お試しください。'
  }
}
