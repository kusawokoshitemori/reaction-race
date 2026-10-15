import { afterEach, expect, test, vi } from 'vitest'
import { readRecords, isRanking, isHistory } from './records'
afterEach(() => vi.unstubAllGlobals())
test('401は一度だけトークン更新して再取得する', async () => {
  const getIdToken = vi.fn(async () => 'token')
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 401 }))
    .mockResolvedValueOnce(Response.json([]))
  vi.stubGlobal('fetch', fetcher)
  expect(
    await readRecords(
      { getIdToken },
      '/api/ranking',
      new AbortController().signal,
      isRanking,
    ),
  ).toEqual([])
  expect(getIdToken.mock.calls).toEqual([[false], [true]])
})
test('不正なレスポンスを拒否する', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ entries: [{}], hasMore: false })),
  )
  await expect(
    readRecords(
      { getIdToken: async () => 'token' },
      '/api/me/history',
      new AbortController().signal,
      isHistory,
    ),
  ).rejects.toThrow('形式')
})
