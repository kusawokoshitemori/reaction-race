import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test } from 'vitest'
import App from './App'

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(cleanup)

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
  await click('ゲストで続ける')
  await screen.findByRole('button', { name: 'ゲーム開始' })
}

test('初回は認証、ゲスト選択後はレートなしのタイトルを表示する', async () => {
  render(<App />)
  expect(screen.getByLabelText('メールアドレス')).toBeTruthy()
  expect(screen.getByLabelText('パスワード')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'ゲーム開始' })).toBeNull()
  await click('ゲストで続ける')
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
  await click('ログイン')
  await screen.findByText('1,500')
  await userEvent.click(
    screen.getByRole('link', { name: 'デモプレイヤーのアカウント' }),
  )
  await userEvent.click(await screen.findByRole('link', { name: '戦績を見る' }))
  await screen.findByRole('heading', { name: '戦績' })
  await go('/auth')
  await click('ログアウト')
  expect(screen.getByRole('button', { name: 'ゲストで続ける' })).toBeTruthy()
  await go('/history')
  expect(screen.getByRole('heading', { name: 'ログイン' })).toBeTruthy()
})

for (const outcome of ['success', 'flying', 'no-record']) {
  test(`${outcome}の結果から再戦できる`, async () => {
    await enter()
    await click('ゲーム開始')
    await click('募集を終了して開始（仮）')
    if (outcome === 'flying') {
      await click('押す（フライング）')
    } else {
      await click('合図を出す（仮）')
      await click(outcome === 'success' ? '押す' : '3秒経過・未入力（仮）')
    }
    if (outcome !== 'no-record') await click('入力受付を終了（仮）')
    await click('確定結果を表示（仮）')
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
    await screen.findByRole('heading', { name: '参加者を募集中' })
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
  await click('ゲストで続ける')
  await go('/unknown')
  expect(screen.getByText(/存在しない画面/)).toBeTruthy()
  await click('ゲーム開始')
  await screen.findByRole('heading', { name: '参加者を募集中' })
  view.unmount()
  render(<App />)
  await waitFor(() => expect(window.location.hash).toBe('#/auth'))
  expect(screen.getByRole('heading', { name: 'ログイン' })).toBeTruthy()
})

test('遊び方の再クリックと戻る矢印で試合状態を保持して復帰する', async () => {
  await enter()
  await click('ゲーム開始')
  await click('募集を終了して開始（仮）')
  for (const close of ['遊び方', '元の画面に戻る']) {
    await click('遊び方')
    expect(
      screen.getByRole('heading', { name: 'hogehoge', level: 1 }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('heading', { name: '合図を待ってください' }),
    ).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    await click(close)
    expect(
      screen.getByRole('heading', { name: '合図を待ってください' }),
    ).toBeTruthy()
    expect(window.location.hash).toBe('#/game')
  }
})

test('遊び方を開閉しても入力中のフォームを保持する', async () => {
  render(<App />)
  await userEvent.type(
    screen.getByLabelText('メールアドレス'),
    'test@example.com',
  )
  await click('遊び方')
  await click('元の画面に戻る')
  expect(screen.getByDisplayValue('test@example.com')).toBeTruthy()
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
