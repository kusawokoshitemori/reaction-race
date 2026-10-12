import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import AccountPanel from './AccountPanel'

afterEach(cleanup)
const profile = {
  uid: 'alice',
  displayName: 'Alice',
  provider: 'google.com',
  guest: false,
}
test('本人の表示名を編集して保存結果を案内する', async () => {
  const onRename = vi.fn(async () => {})
  render(
    <AccountPanel
      profile={profile}
      onRename={onRename}
      onLogout={vi.fn(async () => {})}
    />,
  )
  await userEvent.clear(screen.getByLabelText('表示名'))
  await userEvent.type(screen.getByLabelText('表示名'), '  新しい名前  ')
  await userEvent.click(screen.getByRole('button', { name: '表示名を保存' }))
  expect(onRename).toHaveBeenCalledExactlyOnceWith('新しい名前')
  expect(await screen.findByRole('status')).toBeTruthy()
})
test('保存エラー時は成功表示せず再試行できる', async () => {
  render(
    <AccountPanel
      profile={profile}
      onRename={vi.fn().mockRejectedValue({ code: 'api/unavailable' })}
      onLogout={vi.fn(async () => {})}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: '表示名を保存' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.queryByRole('status')).toBeNull()
  expect(
    screen
      .getByRole('button', { name: '表示名を保存' })
      .hasAttribute('disabled'),
  ).toBe(false)
})
