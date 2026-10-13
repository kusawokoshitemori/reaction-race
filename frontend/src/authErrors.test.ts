import { test, expect } from 'vitest'
import { authDiagnostic, authErrorMessage } from './authErrors'

test('認証の失敗理由を案内し、内部の秘密情報を表示しない', () => {
  expect(authErrorMessage({ code: 'auth/popup-blocked' })).toMatch(
    /ポップアップ/,
  )
  expect(
    authErrorMessage({ code: 'auth/account-exists-with-different-credential' }),
  ).toMatch(/以前使用した方法/)
  expect(authErrorMessage({ message: 'secret-token' })).toBe(
    authErrorMessage(null),
  )
})
test('診断にはSDKの秘密値やメール・URLを含めない', () => {
  expect(
    authDiagnostic({
      code: 'auth/internal-error',
      message:
        'oauth/request_token failed: Could not authenticate you. secret=secret-token',
      customData: { email: 'private@example.com' },
    }),
  ).toBe('auth/internal-error / provider-credentials-rejected')
  expect(
    authDiagnostic({ code: 'secret-token', message: 'private@example.com' }),
  ).toBe('unknown')
  expect(
    authDiagnostic({
      code: 'auth/internal-error',
      message: 'Callback URL not approved for this client',
    }),
  ).toBe('auth/internal-error / callback-url-rejected')
  expect(authDiagnostic(null)).toBe('unknown')
})
