import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import HistoryPanel from './HistoryPanel'
import LiveRankingPanel from './LiveRankingPanel'
const user = { getIdToken: vi.fn(async () => 'token') }
const entry = {
  participantId: 'p',
  name: 'Alice',
  bot: false,
  guest: false,
  outcome: 'success',
  rank: 1,
  reactionMs: 200,
  measurement: 'corrected',
  ratingBefore: 1500,
  ratingAfter: 1520,
  matchId: 'm',
  finishedAt: '2026-10-15T01:00:00Z',
}
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
test('保存済み戦績から詳細を開き一覧へ戻れる', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ entries: [entry], hasMore: true }))
    .mockResolvedValueOnce(
      Response.json({
        matchId: 'm',
        finishedAt: entry.finishedAt,
        entries: [entry],
      }),
    )
  vi.stubGlobal('fetch', fetcher)
  render(<HistoryPanel user={user} />)
  expect(screen.getByRole('status').textContent).toContain('読み込み中')
  await userEvent.click(
    await screen.findByRole('button', { name: '試合詳細を見る' }),
  )
  expect(await screen.findByText('Alice')).toBeTruthy()
  expect(document.activeElement).toBe(
    screen.getByRole('heading', { name: '保存済みの試合結果' }),
  )
  expect(screen.getByText('レート +20（1500 → 1520）')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: '戦績一覧へ戻る' }))
  expect(screen.getByRole('button', { name: '試合詳細を見る' })).toBeTruthy()
  expect(document.activeElement).toBe(
    screen.getByRole('heading', { name: 'あなたの戦績' }),
  )
  expect(fetcher.mock.calls[1][0]).toBe('/api/matches/m')
})
test('失敗後に再読み込みすると空の戦績を表示する', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json({ entries: [], hasMore: false })),
  )
  render(<HistoryPanel user={user} />)
  expect((await screen.findByRole('alert')).textContent).toBe(
    'データを取得できませんでした。再読み込みしてください。',
  )
  await userEvent.click(screen.getByRole('button', { name: '再読み込み' }))
  expect(await screen.findByText('まだ戦績がありません')).toBeTruthy()
})
test('試合詳細の取得失敗から再試行し、空の詳細でも一覧へ戻れる', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ entries: [entry], hasMore: false }))
    .mockResolvedValueOnce(new Response('results unavailable', { status: 503 }))
    .mockResolvedValueOnce(
      Response.json({
        matchId: 'm',
        finishedAt: entry.finishedAt,
        entries: [],
      }),
    )
  vi.stubGlobal('fetch', fetcher)
  render(<HistoryPanel user={user} />)
  await userEvent.click(
    await screen.findByRole('button', { name: '試合詳細を見る' }),
  )
  expect((await screen.findByRole('alert')).textContent).toContain(
    'データを取得できませんでした',
  )
  await userEvent.click(screen.getByRole('button', { name: '再読み込み' }))
  expect(
    await screen.findByText('この試合の参加者記録はありません'),
  ).toBeTruthy()
  expect(fetcher.mock.calls[2][0]).toBe('/api/matches/m')
  await userEvent.click(screen.getByRole('button', { name: '戦績一覧へ戻る' }))
  expect(screen.getByRole('button', { name: '試合詳細を見る' })).toBeTruthy()
  expect(fetcher).toHaveBeenCalledTimes(3)
})
test('次ページを取得する', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ entries: [entry], hasMore: true }))
    .mockResolvedValueOnce(Response.json({ entries: [], hasMore: false }))
  vi.stubGlobal('fetch', fetcher)
  render(<HistoryPanel user={user} />)
  await screen.findByRole('button', { name: '試合詳細を見る' })
  await userEvent.click(screen.getByRole('button', { name: '次の20件' }))
  await screen.findByText('まだ戦績がありません')
  expect(fetcher.mock.calls[1][0]).toBe('/api/me/history?offset=20')
})
test('ランキングはサーバーの同順位と本人を表示する', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json([
        { id: '1', name: 'Alice', rating: 1520, rank: 1, self: false },
        { id: '2', name: 'Bob', rating: 1520, rank: 1, self: true },
      ]),
    ),
  )
  render(<LiveRankingPanel user={user} guest={false} />)
  expect(await screen.findByText('あなたは 1 位')).toBeTruthy()
  expect(screen.getAllByRole('cell', { name: '1' })).toHaveLength(2)
})

test('ユーザーが変わった後に古い応答で表示を戻さない', async () => {
  let resolveOld: ((response: Response) => void) | undefined
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveOld = resolve
        }),
    )
    .mockResolvedValueOnce(Response.json({ entries: [], hasMore: false }))
  vi.stubGlobal('fetch', fetcher)
  const view = render(<HistoryPanel user={user} />)
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
  view.rerender(<HistoryPanel user={{ getIdToken: async () => 'other' }} />)
  await screen.findByText('まだ戦績がありません')
  resolveOld?.(Response.json({ entries: [entry], hasMore: false }))
  await vi.waitFor(() =>
    expect(screen.queryByRole('button', { name: '試合詳細を見る' })).toBeNull(),
  )
})
