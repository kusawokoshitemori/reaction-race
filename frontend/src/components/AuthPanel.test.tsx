import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import AuthPanel from './AuthPanel'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

for (const provider of ['Google', 'X'] as const) {
  test(`${provider}で処理中の操作を無効にし、一度だけログインする`, () => {
    const onLogin = vi.fn()
    const onGuest = vi.fn()
    render(<AuthPanel onLogin={onLogin} onGuest={onGuest} />)
    fireEvent.click(screen.getByRole('button', { name: `${provider}で続ける` }))
    expect(screen.getByRole('status').textContent).toContain('ログイン中')
    for (const name of ['Googleで続ける', 'Xで続ける', 'ゲストで参加']) {
      expect(
        screen.getByRole('button', { name }).hasAttribute('disabled'),
      ).toBe(true)
      fireEvent.click(screen.getByRole('button', { name }))
    }
    act(() => vi.advanceTimersByTime(800))
    expect(onLogin).toHaveBeenCalledExactlyOnceWith(provider)
    expect(onGuest).not.toHaveBeenCalled()
  })
}

test('ログイン失敗を表示し、再試行できる', () => {
  const onLogin = vi.fn()
  render(<AuthPanel onLogin={onLogin} onGuest={vi.fn()} />)
  fireEvent.click(screen.getByText('表示確認用'))
  fireEvent.click(screen.getByLabelText('ログイン失敗を再現する'))
  fireEvent.click(screen.getByRole('button', { name: 'Googleで続ける' }))
  act(() => vi.advanceTimersByTime(800))
  expect(screen.getByRole('alert').textContent).toContain(
    'ログインできませんでした',
  )
  expect(onLogin).not.toHaveBeenCalled()
  fireEvent.click(screen.getByLabelText('ログイン失敗を再現する'))
  fireEvent.click(screen.getByRole('button', { name: 'Googleで続ける' }))
  act(() => vi.advanceTimersByTime(800))
  expect(onLogin).toHaveBeenCalledExactlyOnceWith('Google')
  expect(screen.queryByRole('alert')).toBeNull()
})

test('画面を離れた後に遅れてログインしない', () => {
  const onLogin = vi.fn()
  const view = render(<AuthPanel onLogin={onLogin} onGuest={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Xで続ける' }))
  view.unmount()
  act(() => vi.runAllTimers())
  expect(onLogin).not.toHaveBeenCalled()
})
