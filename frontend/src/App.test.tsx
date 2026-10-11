import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'

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

test('仮ログイン後のレート・戦績とログアウト', async () => {
  render(<App />)
  await click('Googleで続ける')
  await screen.findByText('1,500')
  await userEvent.click(
    screen.getByRole('link', { name: 'デモプレイヤーのアカウント' }),
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

for (const outcome of ['success', 'flying', 'no-record']) {
  test(`${outcome}の結果から再戦できる`, async () => {
    await enter()
    await click('ゲーム開始')
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    fireEvent.click(screen.getByRole('button', { name: /構える/ }))
    if (outcome !== 'flying') act(() => vi.advanceTimersByTime(2000))
    if (outcome === 'no-record') act(() => vi.advanceTimersByTime(3000))
    else {
      fireEvent.keyDown(window, { code: 'Space' })
      act(() => vi.advanceTimersByTime(1300))
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
    await click('結果を見る')
    await screen.findByRole('heading', { name: '試合結果' })
    const summary = screen.getByRole('region', { name: 'あなたの結果' })
    expect(summary.textContent).toContain(
      outcome === 'success'
        ? '成功'
        : outcome === 'flying'
          ? 'フライング'
          : '未入力',
    )
    await click('再戦')
    await screen.findByRole('heading', { name: '一瞬に、集中。' })
    await click('タイトルに戻る')
    await screen.findByRole('button', { name: 'ゲーム開始' })
    await go('/game')
    expect(screen.getByText(/参加中の試合がありません/)).toBeTruthy()
    await go('/result')
    expect(screen.getByText(/表示できる試合結果がありません/)).toBeTruthy()
  })
}

test('直接アクセス・不正URL・再読み込み相当の再マウントを制御する', async () => {
  window.history.replaceState(null, '', '#/game')
  const view = render(<App />)
  expect(screen.getByRole('heading', { name: 'ログイン' })).toBeTruthy()
  await click('ゲストで参加')
  await go('/unknown')
  expect(screen.getByText(/存在しない画面/)).toBeTruthy()
  await click('ゲーム開始')
  await screen.findByRole('heading', { name: '一瞬に、集中。' })
  view.unmount()
  render(<App />)
  await waitFor(() => expect(window.location.hash).toBe('#/auth'))
  expect(screen.getByRole('heading', { name: 'ログイン' })).toBeTruthy()
})

test('遊び方を開くと試合は中断し、戻ったあと結果を確認できる', async () => {
  await enter()
  await click('ゲーム開始')
  await click('構える')
  for (const close of ['遊び方', '元の画面に戻る']) {
    await click('遊び方')
    expect(
      screen.getByRole('heading', { name: 'hogehoge', level: 1 }),
    ).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '中断' })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    await click(close)
    expect(screen.getByRole('heading', { name: '中断' })).toBeTruthy()
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
