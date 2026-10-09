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
  await userEvent.click(screen.getByRole('link', { name: 'ランキング' }))
  await screen.findByRole('heading', { name: 'ランキング' })
  await click('タイトルに戻る')
  await screen.findByRole('button', { name: 'ゲーム開始' })
})

test('仮ログイン後のレート・戦績とログアウト', async () => {
  render(<App />)
  await click('ログイン')
  await screen.findByText('1,500')
  await userEvent.click(screen.getByRole('link', { name: 'デモプレイヤー' }))
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
    expect(
      screen.getByText(
        outcome === 'success'
          ? /成功：12位/
          : outcome === 'flying'
            ? /フライング：順位/
            : /未入力：記録なし/,
      ),
    ).toBeTruthy()
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
