import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import RankingPanel from './RankingPanel'
import { demoRanking } from '../ranking'

afterEach(cleanup)
const actions = { onRetry: () => {} }

test('上位50件だけを表示し、自分の行を示す', () => {
  render(
    <RankingPanel
      {...actions}
      currentPlayerId="demo-player"
      state={{
        status: 'success',
        entries: [...demoRanking, { id: 'extra', name: '51位の人', rating: 0 }],
      }}
    />,
  )
  expect(screen.getAllByRole('row')).toHaveLength(51)
  expect(screen.queryByText('51位の人')).toBeNull()
  expect(screen.getByText('あなたは 25 位')).toBeTruthy()
  expect(
    within(screen.getByText('デモプレイヤー').closest('tr')!).getByText(
      'あなた',
    ),
  ).toBeTruthy()
  expect(screen.getByText('プレイヤー50')).toBeTruthy()
})

test('圏外、空、読み込み中の表示を切り替える', () => {
  const view = render(
    <RankingPanel
      {...actions}
      currentPlayerId="outside"
      state={{ status: 'success', entries: demoRanking }}
    />,
  )
  expect(screen.getByText('あなたは50位以内に入っていません')).toBeTruthy()
  view.rerender(
    <RankingPanel
      {...actions}
      currentPlayerId="outside"
      state={{ status: 'success', entries: [] }}
    />,
  )
  expect(screen.getByRole('status').textContent).toContain(
    'まだランキングの記録がありません',
  )
  expect(screen.queryByRole('table')).toBeNull()
  view.rerender(
    <RankingPanel
      {...actions}
      currentPlayerId={null}
      state={{ status: 'loading' }}
    />,
  )
  expect(screen.getByRole('status').textContent).toContain('読み込み中')
})

test('取得失敗時に再読み込みできる', async () => {
  const retry = vi.fn()
  render(
    <RankingPanel
      {...actions}
      onRetry={retry}
      currentPlayerId={null}
      state={{ status: 'error', message: 'ランキングを取得できませんでした' }}
    />,
  )
  expect(screen.getByRole('alert').textContent).toContain('取得できません')
  await userEvent.click(screen.getByRole('button', { name: '再読み込み' }))
  expect(retry).toHaveBeenCalledOnce()
})
