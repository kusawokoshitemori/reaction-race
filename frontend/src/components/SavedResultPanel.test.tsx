import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import SavedResultPanel from './SavedResultPanel'
import type { MatchResult } from '../result'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const result: MatchResult = {
  matchId: 'match-1',
  persistence: 'pending',
  guest: false,
  participants: 100,
  rating: null,
  outcome: 'flying',
  rank: null,
  reactionMs: null,
}
const user = { getIdToken: vi.fn(async () => 'token') }

test('保存完了後だけ確定レートを表示する', async () => {
  let finish: ((response: Response) => void) | undefined
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    ),
  )
  render(
    <SavedResultPanel
      result={result}
      standings={[]}
      user={user}
      onRematch={() => {}}
    />,
  )
  expect(screen.getByText('レート未確定')).toBeTruthy()
  expect(screen.getByText('結果を保存しています…')).toBeTruthy()
  await waitFor(() => expect(finish).toBeDefined())
  finish?.(
    new Response(
      JSON.stringify({
        persistence: 'saved',
        rating: { before: 1500, after: 1495 },
      }),
    ),
  )
  expect(await screen.findByText('−5')).toBeTruthy()
  expect(screen.getByText('結果を保存しました。')).toBeTruthy()
})

test('保存失敗を明示し仮レートを出さない', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ persistence: 'retrying', rating: null })),
    ),
  )
  render(
    <SavedResultPanel
      result={result}
      standings={[]}
      user={user}
      onRematch={() => {}}
    />,
  )
  expect(await screen.findByText(/結果を保存できませんでした/)).toBeTruthy()
  expect(screen.queryByLabelText(/レート .*から/)).toBeNull()
})

test('ゲストの保存済み結果にはレートを表示しない', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ persistence: 'saved', rating: null })),
    ),
  )
  render(
    <SavedResultPanel
      result={{ ...result, guest: true }}
      standings={[]}
      user={user}
      onRematch={() => {}}
    />,
  )
  expect(await screen.findByText('結果を保存しました。')).toBeTruthy()
  expect(screen.getByText('ゲストにはレートがありません')).toBeTruthy()
})

test('取得期限切れを保存済みと誤認しない', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 404 })),
  )
  render(
    <SavedResultPanel
      result={result}
      standings={[]}
      user={user}
      onRematch={() => {}}
    />,
  )
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.queryByText('結果を保存しました。')).toBeNull()
  expect(screen.getByRole('button', { name: '保存状態を再確認' })).toBeTruthy()
})

test('恒久的な保存失敗は未確定として表示する', async () => {
  const fetcher = vi.fn(async () =>
    Response.json({ persistence: 'failed', rating: null }),
  )
  vi.stubGlobal('fetch', fetcher)
  render(
    <SavedResultPanel
      result={result}
      standings={[]}
      user={user}
      onRematch={() => {}}
    />,
  )
  expect(await screen.findByText(/自動再試行を終了しました/)).toBeTruthy()
  expect(screen.getByText('レート未確定')).toBeTruthy()
  expect(fetcher).toHaveBeenCalledOnce()
})
