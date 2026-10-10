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
