import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import ResultPanel from './ResultPanel'
import {
  createDemoResult,
  createDemoStandings,
  formatRatingDelta,
} from '../result'

afterEach(cleanup)

for (const outcome of ['success', 'flying', 'no-record'] as const) {
  for (const signedIn of [true, false]) {
    test(`${outcome} / ${signedIn ? 'ログイン' : 'ゲスト'} の個人結果と100人の一覧`, () => {
      const result = createDemoResult(outcome, signedIn)
      const entries = createDemoStandings(result)
      expect(entries).toHaveLength(100)
      expect(new Set(entries.map((entry) => entry.id)).size).toBe(100)
      expect(entries.filter((entry) => entry.isYou)).toHaveLength(1)
      expect(entries.find((entry) => entry.isYou)).toMatchObject({
        outcome,
        rank: result.rank,
        reactionMs: result.reactionMs,
      })
      const valid = entries.filter((entry) => entry.outcome === 'success')
      valid.forEach((entry, index) => {
        expect(entry.rank).toBe(index + 1)
        if (index)
          expect(entry.reactionMs).toBeGreaterThanOrEqual(
            valid[index - 1].reactionMs!,
          )
      })
      entries
        .filter((entry) => entry.outcome !== 'success')
        .forEach((entry) => {
          expect(entry.rank).toBeNull()
          expect(entry.reactionMs).toBeNull()
        })
      render(<ResultPanel result={result} onRematch={() => {}} />)
      expect(screen.queryByText('合図に反応できました！')).toBeNull()
      expect(screen.getAllByRole('row')).toHaveLength(101)
      expect(screen.getByText('あなた')).toBeTruthy()
      if (signedIn)
        expect(
          screen.getByText(outcome === 'success' ? '+6' : '−7'),
        ).toBeTruthy()
      else expect(screen.getByText('ゲストにはレートがありません')).toBeTruthy()
    })
  }
}

test('再戦・タイトル操作はランキングより前にあり、再戦を通知する', async () => {
  const onRematch = vi.fn()
  render(
    <ResultPanel
      result={createDemoResult('success', true)}
      onRematch={onRematch}
    />,
  )
  const rematch = screen.getByRole('button', { name: '再戦' })
  const title = screen.getByRole('link', { name: 'タイトルに戻る' })
  const ranking = screen.getByRole('region', { name: '今回のランキング 100人' })
  for (const action of [rematch, title])
    expect(
      action.compareDocumentPosition(ranking) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  expect(title.getAttribute('href')).toBe('#/')
  await userEvent.click(rematch)
  expect(onRematch).toHaveBeenCalledOnce()
})

test('1位と自分の行へ移動してキーボードフォーカスも移す', async () => {
  const scroll = vi.fn()
  const previous = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = scroll
  try {
    render(
      <ResultPanel
        result={createDemoResult('flying', false)}
        onRematch={() => {}}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: '自分へ' }))
    expect(document.activeElement?.textContent).toContain(
      'ゲストあなたフライング記録なし',
    )
    await userEvent.click(screen.getByRole('button', { name: '1位へ' }))
    expect(
      within(document.activeElement as HTMLElement).getByText('はやぶさ'),
    ).toBeTruthy()
    expect(scroll).toHaveBeenCalledTimes(2)
  } finally {
    Element.prototype.scrollIntoView = previous
  }
})

test('レート増減の符号と変動なし', () => {
  expect(formatRatingDelta(6)).toBe('+6')
  expect(formatRatingDelta(-7)).toBe('−7')
  expect(formatRatingDelta(0)).toBe('±0')
})

test('補正済みと参考記録の表示を区別する', () => {
  const result = {
    participants: 100,
    rating: null,
    outcome: 'success' as const,
    rank: 1,
    reactionMs: 200,
    measurement: 'corrected' as const,
  }
  const view = render(
    <ResultPanel result={result} standings={[]} onRematch={() => {}} />,
  )
  expect(screen.getByText('通信遅延を補正した記録')).toBeTruthy()
  view.rerender(
    <ResultPanel
      result={{ ...result, rank: null, measurement: 'unstable' }}
      standings={[]}
      onRematch={() => {}}
    />,
  )
  expect(screen.getByText('参考記録')).toBeTruthy()
  expect(screen.getByText('補正できないため順位対象外')).toBeTruthy()
})

test('順位対象外の参加者には参考記録ラベルを表示する', () => {
  render(
    <ResultPanel
      result={{
        participants: 1,
        rating: null,
        outcome: 'success',
        rank: null,
        reactionMs: 150,
        measurement: 'unavailable',
      }}
      standings={[
        {
          id: 'p',
          name: '参考プレイヤー',
          isYou: true,
          outcome: 'success',
          rank: null,
          reactionMs: 150,
          measurement: 'unavailable',
        },
      ]}
      onRematch={() => {}}
    />,
  )
  expect(screen.getByText('参考記録（順位対象外）')).toBeTruthy()
})
