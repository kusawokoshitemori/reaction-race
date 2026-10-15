import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { fetchProfile } from './auth'
import { demoRanking } from './ranking'
vi.mock('./records', async (original) => {
  const actual = await original<typeof import('./records')>()
  return {
    ...actual,
    useRecords: (_user: unknown, path: string) => ({
      data:
        path === '/api/ranking' ? demoRanking : { entries: [], hasMore: false },
      retry: () => {},
    }),
  }
})

vi.mock('./components/LobbyPanel', () => ({
  default: ({ onLeave }: { onLeave: () => void }) => (
    <section>
      <h2>一瞬を競う、仲間を待つ。</h2>
      <button onClick={onLeave}>退出してタイトルへ</button>
    </section>
  ),
}))

const authState = vi.hoisted(() => {
  type TestUser = { uid: string; isAnonymous: boolean }
  const listeners = new Set<(user: TestUser | null) => void>()
  let user: TestUser | null = null
  return {
    listeners,
    get user() {
      return user
    },
    emit(next: TestUser | null) {
      user = next
      listeners.forEach((callback) => callback(user))
    },
    reset() {
      user = null
      listeners.clear()
    },
  }
})
vi.mock('./auth', () => ({
  observeUser: (callback: (user: typeof authState.user) => void) => {
    authState.listeners.add(callback)
    callback(authState.user)
    return () => authState.listeners.delete(callback)
  },
  login: async () => authState.emit({ uid: 'registered', isAnonymous: false }),
  loginGuest: async () => {
    if (!authState.user?.isAnonymous)
      authState.emit({ uid: 'guest', isAnonymous: true })
  },
  logout: async () => authState.emit(null),
  fetchProfile: vi.fn(
    async (
      user: { uid: string; isAnonymous: boolean },
      displayName?: string,
    ) => ({
      uid: user.uid,
      guest: user.isAnonymous,
      displayName: displayName ?? 'テストプレイヤー',
      provider: user.isAnonymous ? 'anonymous' : 'google.com',
    }),
  ),
}))
beforeEach(() => {
  authState.reset()
  vi.mocked(fetchProfile).mockReset()
})

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function click(name: string) {
  await userEvent.click(await screen.findByRole('button', { name }))
}
async function go(hash: string) {
  await act(async () => {
    window.history.replaceState(null, '', `#${hash}`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}
async function enter() {
  render(<App />)
  await click('ゲストで参加')
  await screen.findByRole('button', { name: 'ゲーム開始' })
}

test('初回は認証、ゲスト選択後はレートなしのタイトルを表示する', async () => {
  render(<App />)
  expect(screen.getByRole('button', { name: 'Googleで続ける' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Xで続ける' })).toBeTruthy()
  expect(within(screen.getByRole('banner')).queryByRole('link')).toBeNull()
  expect(within(screen.getByRole('banner')).queryByRole('button')).toBeNull()
  expect(screen.queryByRole('button', { name: 'ゲーム開始' })).toBeNull()
  await click('ゲストで参加')
  await screen.findByRole('button', { name: 'ゲーム開始' })
  expect(screen.getByText('レートなし')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'ランキング' }))
  await screen.findByRole('heading', { name: 'ランキング' })
  expect(screen.queryByRole('button', { name: 'タイトルに戻る' })).toBeNull()
  expect(screen.getAllByRole('row')).toHaveLength(51)
  await click('ランキング')
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'ランキング' }),
  )
  await screen.findByRole('button', { name: 'ゲーム開始' })
})

test('ログイン後のレート・戦績とログアウト', async () => {
  render(<App />)
  await click('Googleで続ける')
  await screen.findByText('1,500')
  await userEvent.click(
    screen.getByRole('link', { name: 'テストプレイヤーのアカウント' }),
  )
  await userEvent.click(await screen.findByRole('link', { name: '戦績を見る' }))
  await screen.findByRole('heading', { name: '戦績' })
  await go('/auth')
  await click('ログアウト')
  expect(within(screen.getByRole('banner')).queryByRole('link')).toBeNull()
  expect(within(screen.getByRole('banner')).queryByRole('button')).toBeNull()
  expect(screen.getByRole('button', { name: 'ゲストで参加' })).toBeTruthy()
  await go('/history')
  expect(screen.getByRole('heading', { name: 'ログイン' })).toBeTruthy()
})

test('待機室から退出するとタイトルに戻り、結果は作らない', async () => {
  await enter()
  await click('ゲーム開始')
  await screen.findByRole('heading', { name: '一瞬を競う、仲間を待つ。' })
  await click('退出してタイトルへ')
  await screen.findByRole('button', { name: 'ゲーム開始' })
  await go('/result')
  expect(screen.getByText(/表示できる試合結果がありません/)).toBeTruthy()
})

test('直接アクセス・不正URL・再読み込み相当の再マウントを制御する', async () => {
  window.history.replaceState(null, '', '#/game')
  const view = render(<App />)
  expect(screen.getByRole('heading', { name: 'ログイン' })).toBeTruthy()
  await click('ゲストで参加')
  await go('/unknown')
  expect(screen.getByText(/存在しない画面/)).toBeTruthy()
  await click('ゲーム開始')
  await screen.findByRole('heading', { name: '一瞬を競う、仲間を待つ。' })
  view.unmount()
  render(<App />)
  await waitFor(() => expect(window.location.hash).toBe('#/'))
  expect(await screen.findByRole('button', { name: 'ゲーム開始' })).toBeTruthy()
})

test('遊び方から待機室へ戻れる', async () => {
  await enter()
  await click('ゲーム開始')
  for (const close of ['遊び方', '元の画面に戻る']) {
    await click('遊び方')
    expect(
      screen.getByRole('heading', { name: 'hogehoge', level: 1 }),
    ).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '中断' })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    await click(close)
    expect(
      screen.getByRole('heading', { name: '一瞬を競う、仲間を待つ。' }),
    ).toBeTruthy()
    expect(window.location.hash).toBe('#/game')
  }
})

test('初回の遊び方から参加方法の選択へ戻れる', async () => {
  render(<App />)
  await click('遊び方')
  await click('元の画面に戻る')
  expect(screen.getByRole('button', { name: 'Googleで続ける' })).toBeTruthy()
  expect(within(screen.getByRole('banner')).queryByRole('button')).toBeNull()
})

test('ゲスト参加後はヘッダーからログイン画面へ戻れる', async () => {
  await enter()
  await userEvent.click(
    screen.getByRole('link', { name: 'ゲスト：ログイン・アカウント' }),
  )
  await screen.findByRole('button', { name: 'Googleで続ける' })
  expect(
    within(screen.getByRole('banner')).getByRole('button', {
      name: 'タイトルに戻る',
    }),
  ).toBeTruthy()
})

test('音設定を切り替え、再マウント後も保持する', async () => {
  localStorage.clear()
  const view = render(<App />)
  expect(
    screen
      .getByRole('button', { name: '音を有効にする' })
      .getAttribute('aria-pressed'),
  ).toBe('false')
  await click('音を有効にする')
  view.unmount()
  render(<App />)
  expect(
    screen
      .getByRole('button', { name: '音を有効にする' })
      .getAttribute('aria-pressed'),
  ).toBe('true')
  await click('音を有効にする')
  expect(
    screen
      .getByRole('button', { name: '音を有効にする' })
      .getAttribute('aria-pressed'),
  ).toBe('false')
  localStorage.clear()
})

test('ランキングは背景クリックやEscapeでは閉じず同じボタンで閉じる', async () => {
  await enter()
  await click('ランキング')
  const title = await screen.findByRole('heading', { name: 'ランキング' })
  expect(document.activeElement).toBe(title)
  expect(screen.queryByRole('button', { name: 'ゲーム開始' })).toBeNull()
  await userEvent.keyboard('{Escape}')
  await userEvent.click(document.getElementById('main-content')!)
  expect(screen.getByRole('heading', { name: 'ランキング' })).toBeTruthy()
  await click('ランキング')
  await screen.findByRole('button', { name: 'ゲーム開始' })
  await go('/ranking')
  expect(
    screen
      .getByRole('button', { name: 'ランキング' })
      .getAttribute('aria-expanded'),
  ).toBe('true')
  await go('/')
  expect(
    screen
      .getByRole('button', { name: 'ランキング' })
      .getAttribute('aria-expanded'),
  ).toBe('false')
})

test('ログイン済みで戦績へ直接アクセスすると認証復元後に戦績を表示する', async () => {
  authState.emit({ uid: 'registered', isAnonymous: false })
  window.history.replaceState(null, '', '#/history')
  render(<App />)
  expect(await screen.findByRole('heading', { name: '戦績' })).toBeTruthy()
})

test('別タブのログアウトで保護画面からログインへ戻る', async () => {
  authState.emit({ uid: 'registered', isAnonymous: false })
  render(<App />)
  await screen.findByRole('button', { name: 'ゲーム開始' })
  await go('/history')
  await act(async () => authState.emit(null))
  expect(
    await screen.findByRole('button', { name: 'Googleで続ける' }),
  ).toBeTruthy()
  expect(window.location.hash).toBe('#/auth')
})

test('復元済みゲストがゲストで参加を押すとタイトルへ戻る', async () => {
  authState.emit({ uid: 'guest', isAnonymous: true })
  render(<App />)
  await screen.findByRole('button', { name: 'ゲーム開始' })
  await go('/auth')
  await click('ゲストで参加')
  await screen.findByRole('button', { name: 'ゲーム開始' })
})

test('同じユーザーのトークン更新はプロフィールを再取得せずプレイ画面を保つ', async () => {
  await enter()
  await click('ゲーム開始')
  const heading = screen.getByRole('heading', {
    name: '一瞬を競う、仲間を待つ。',
  })
  vi.mocked(fetchProfile).mockClear()
  await act(async () => authState.emit({ uid: 'guest', isAnonymous: true }))
  expect(fetchProfile).not.toHaveBeenCalled()
  expect(
    screen.getByRole('heading', { name: '一瞬を競う、仲間を待つ。' }),
  ).toBe(heading)
  expect(window.location.hash).toBe('#/game')
  await act(async () => authState.emit({ uid: 'other', isAnonymous: false }))
  expect(fetchProfile).toHaveBeenCalledTimes(1)
  await screen.findByRole('link', { name: 'テストプレイヤーのアカウント' })
})

test('初回のプロフィール取得が失敗しても再試行できる', async () => {
  vi.mocked(fetchProfile).mockRejectedValueOnce({ code: 'api/unavailable' })
  authState.emit({ uid: 'registered', isAnonymous: false })
  render(<App />)
  await screen.findByRole('alert')
  await click('再試行')
  await screen.findByRole('button', { name: 'ゲーム開始' })
  expect(fetchProfile).toHaveBeenCalledTimes(2)
})

test('ログアウト後に古いプロフィール取得が完了しても認証を復元しない', async () => {
  let complete:
    ((value: Awaited<ReturnType<typeof fetchProfile>>) => void) | undefined
  vi.mocked(fetchProfile).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  authState.emit({ uid: 'registered', isAnonymous: false })
  render(<App />)
  await act(async () => authState.emit(null))
  await screen.findByRole('button', { name: 'Googleで続ける' })
  await act(async () =>
    complete?.({
      uid: 'registered',
      guest: false,
      displayName: '古いユーザー',
      provider: 'google.com',
    }),
  )
  expect(screen.queryByRole('button', { name: 'ゲーム開始' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Googleで続ける' })).toBeTruthy()
})

for (const registered of [false, true]) {
  test(`${registered ? '登録ユーザー' : 'ゲスト'}はヘッダーのアカウントをもう一度押して閉じられる`, async () => {
    render(<App />)
    await click(registered ? 'Googleで続ける' : 'ゲストで参加')
    await screen.findByRole('button', { name: 'ゲーム開始' })
    const accountName = registered
      ? 'テストプレイヤーのアカウント'
      : 'ゲスト：ログイン・アカウント'
    await userEvent.click(screen.getByRole('link', { name: accountName }))
    await screen.findByRole(registered ? 'textbox' : 'button', {
      name: registered ? '表示名' : 'Googleで続ける',
    })
    expect(
      screen
        .getByRole('link', { name: accountName })
        .getAttribute('aria-expanded'),
    ).toBe('true')
    await userEvent.click(screen.getByRole('link', { name: accountName }))
    await screen.findByRole('button', { name: 'ゲーム開始' })
    expect(
      screen
        .getByRole('link', { name: accountName })
        .getAttribute('aria-expanded'),
    ).toBe('false')
  })
}
