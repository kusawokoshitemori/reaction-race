import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import AuthPanel from './AuthPanel'

afterEach(cleanup)
for (const provider of ['Google', 'X'] as const) {
  test(`${provider}の処理中は全ボタンを無効にして二重送信を防ぐ`, async () => {
    let finish: () => void = () => {}
    const promise = new Promise<void>((resolve) => {
      finish = resolve
    })
    const onLogin = vi.fn(() => promise)
    const onGuest = vi.fn(async () => {})
    render(<AuthPanel onLogin={onLogin} onGuest={onGuest} />)
    fireEvent.click(screen.getByRole('button', { name: `${provider}で続ける` }))
    for (const name of ['Googleで続ける', 'Xで続ける', 'ゲストで参加']) {
      const button = screen.getByRole('button', { name })
      expect(button.hasAttribute('disabled')).toBe(true)
      fireEvent.click(button)
    }
    expect(onLogin).toHaveBeenCalledExactlyOnceWith(provider)
    expect(onGuest).not.toHaveBeenCalled()
    await act(async () => finish())
    expect(
      screen
        .getByRole('button', { name: 'ゲストで参加' })
        .hasAttribute('disabled'),
    ).toBe(false)
  })
}
test('Xの失敗理由を表示し秘密値を漏らさず再試行できる', async () => {
  const onLogin = vi
    .fn()
    .mockRejectedValueOnce({
      code: 'auth/invalid-credential',
      message: 'secret-token',
    })
    .mockResolvedValue(undefined)
  render(<AuthPanel onLogin={onLogin} onGuest={vi.fn(async () => {})} />)
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Xで続ける' })),
  )
  expect(screen.getByRole('alert').textContent).toContain(
    '認証情報を確認できませんでした',
  )
  expect(screen.queryByText(/secret-token/)).toBeNull()
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Xで続ける' })),
  )
  expect(onLogin).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('alert')).toBeNull()
})
test('ゲストの認証失敗でも画面にエラーを表示する', async () => {
  render(
    <AuthPanel
      onLogin={vi.fn(async () => {})}
      onGuest={vi
        .fn()
        .mockRejectedValue({ code: 'auth/network-request-failed' })}
    />,
  )
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'ゲストで参加' })),
  )
  expect(screen.getByRole('alert').textContent).toContain(
    '通信できませんでした',
  )
})
