import { beforeEach, expect, test, vi } from 'vitest'

const sdk = vi.hoisted(() => {
  type User = { uid: string; isAnonymous: boolean }
  const client: { currentUser: User | null } = { currentUser: null }
  let observer: ((user: User | null) => void) | undefined
  return {
    client,
    emit(user: User | null) {
      client.currentUser = user
      observer?.(user)
    },
    initializeAuth: vi.fn(() => client),
    setPersistence: vi.fn(async () => {}),
    signInAnonymously: vi.fn(async () => {
      client.currentUser = { uid: 'new-guest', isAnonymous: true }
    }),
    signInWithPopup: vi.fn(async () => ({
      user: { uid: 'registered', isAnonymous: false },
    })),
    signOut: vi.fn(async () => {
      client.currentUser = null
      observer?.(null)
    }),
    onIdTokenChanged: vi.fn((_client, next) => {
      observer = next
      next(client.currentUser)
      return () => {
        observer = undefined
      }
    }),
  }
})
vi.mock('firebase/app', () => ({ initializeApp: vi.fn() }))
vi.mock('firebase/auth', () => ({
  ...sdk,
  browserLocalPersistence: 'local',
  browserSessionPersistence: 'session',
  browserPopupRedirectResolver: {},
  GoogleAuthProvider: class {},
  TwitterAuthProvider: class {},
}))
const marker = 'reaction-race:guest-session'
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  sdk.client.currentUser = null
  sessionStorage.clear()
  for (const name of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'APP_ID'])
    vi.stubEnv(`VITE_FIREBASE_${name}`, 'test')
})

test('ゲスト参加はセッション保存に切り替えてから匿名認証する', async () => {
  const auth = await import('./auth')
  await auth.loginGuest()
  expect(sdk.setPersistence).toHaveBeenCalledWith(sdk.client, 'session')
  expect(sdk.setPersistence.mock.invocationCallOrder[0]).toBeLessThan(
    sdk.signInAnonymously.mock.invocationCallOrder[0],
  )
  expect(sessionStorage.getItem(marker)).toBe('1')
  await auth.loginGuest()
  expect(sdk.signInAnonymously).toHaveBeenCalledTimes(1)
})

test('同じタブの再読み込みはセッション保存から復元し、新しいタブはローカル保存だけを見る', async () => {
  sessionStorage.setItem(marker, '1')
  await import('./auth')
  expect(sdk.initializeAuth).toHaveBeenLastCalledWith(
    undefined,
    expect.objectContaining({ persistence: 'session' }),
  )
  vi.resetModules()
  sessionStorage.clear()
  await import('./auth')
  expect(sdk.initializeAuth).toHaveBeenLastCalledWith(
    undefined,
    expect.objectContaining({ persistence: 'local' }),
  )
})

test('旧バージョンのローカル保存ゲストは復元せずログアウトする', async () => {
  sdk.client.currentUser = { uid: 'old-guest', isAnonymous: true }
  const auth = await import('./auth')
  const next = vi.fn()
  const unsubscribe = auth.observeUser(next, vi.fn())
  await Promise.resolve()
  expect(sdk.signOut).toHaveBeenCalledTimes(1)
  expect(next.mock.calls).toEqual([[null]])
  unsubscribe()
})

test('同じタブのゲストは同じIDで復元する', async () => {
  sessionStorage.setItem(marker, '1')
  const user = { uid: 'guest', isAnonymous: true }
  sdk.client.currentUser = user
  const auth = await import('./auth')
  const next = vi.fn()
  const unsubscribe = auth.observeUser(next, vi.fn())
  expect(next).toHaveBeenCalledWith(user)
  expect(sdk.signOut).not.toHaveBeenCalled()
  unsubscribe()
})

test('プロバイダーのポップアップはクリック直後に開き成功後だけローカル保存へ切り替える', async () => {
  sessionStorage.setItem(marker, '1')
  const auth = await import('./auth')
  const pending = auth.login('Google')
  expect(sdk.signInWithPopup).toHaveBeenCalledTimes(1)
  expect(sdk.setPersistence).not.toHaveBeenCalled()
  await pending
  expect(sdk.setPersistence).toHaveBeenCalledWith(sdk.client, 'local')
  expect(sessionStorage.getItem(marker)).toBeNull()
})

test('プロバイダーログインのキャンセルはゲストの保存方式を変えない', async () => {
  sessionStorage.setItem(marker, '1')
  sdk.signInWithPopup.mockRejectedValueOnce({
    code: 'auth/popup-closed-by-user',
  })
  const auth = await import('./auth')
  await expect(auth.login('X')).rejects.toEqual({
    code: 'auth/popup-closed-by-user',
  })
  expect(sdk.setPersistence).not.toHaveBeenCalled()
  expect(sessionStorage.getItem(marker)).toBe('1')
})

test('ログアウトでゲスト復元の印も解除する', async () => {
  sessionStorage.setItem(marker, '1')
  const auth = await import('./auth')
  await auth.logout()
  expect(sessionStorage.getItem(marker)).toBeNull()
})
