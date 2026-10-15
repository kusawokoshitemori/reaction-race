import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import { saveRecovery } from './recovery'
const identity = vi.hoisted(() => ({
  loading: false,
  error: '',
  profile: {
    uid: 'registered',
    displayName: 'Alice',
    guest: false,
    provider: 'google.com',
  },
  user: { uid: 'registered', getIdToken: async () => 'token' },
  retry: () => {},
  rename: async () => {},
}))
vi.mock('./useIdentity', () => ({ useIdentity: () => identity }))
class Socket {
  static OPEN = 1
  static instances: Socket[] = []
  readyState = 1
  onopen?: () => void
  onmessage?: () => void
  onclose?: () => void
  send = vi.fn()
  close = vi.fn()
  constructor() {
    Socket.instances.push(this)
  }
}
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})
test('戦績で再読込した後のゲーム開始は復帰IDなしのjoinを送る', async () => {
  Socket.instances = []
  saveRecovery('registered', {
    instanceId: 'old-instance',
    roomId: 'finished-room',
  })
  window.history.replaceState(null, '', '#/history')
  vi.stubGlobal('WebSocket', Socket)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ticket: 'a'.repeat(64) })),
  )
  render(<App />)
  await userEvent.click(
    await screen.findByRole('button', { name: 'タイトルに戻る' }),
  )
  await userEvent.click(
    await screen.findByRole('button', { name: 'ゲーム開始' }),
  )
  await waitFor(() => expect(Socket.instances).toHaveLength(1))
  act(() => Socket.instances[0].onopen?.())
  expect(Socket.instances[0].send).toHaveBeenCalledWith('{"type":"join"}')
})
