import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import LobbyPanel from './LobbyPanel'
class Socket {
  static OPEN = 1
  static instances: Socket[] = []
  readyState = 1
  onopen?: () => void
  onmessage?: (event: { data: string }) => void
  onclose?: (event: { reason: string }) => void
  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = 3
  })
  constructor() {
    Socket.instances.push(this)
  }
}
const user = { getIdToken: vi.fn(async () => 'token') }
beforeEach(() => {
  Socket.instances = []
  vi.stubGlobal('WebSocket', Socket)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ticket: 'a'.repeat(64) }),
    })),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
async function connection() {
  await waitFor(() => expect(Socket.instances).toHaveLength(1))
  const socket = Socket.instances[0]
  if (!socket) throw new Error('missing socket')
  act(() => socket.onopen?.())
  return socket
}
test('人数確定とボット補充を表示し、退出時に接続を閉じる', async () => {
  const view = render(<LobbyPanel user={user} onLeave={vi.fn()} />)
  const socket = await connection()
  expect(socket.send).toHaveBeenCalledWith('{"type":"join"}')
  const base = {
    type: 'room',
    roomId: 'r',
    phase: 'waiting',
    deadline: 11000,
    serverTime: 1000,
    capacity: 100,
    participants: [{ id: 'p', name: 'ゲスト', bot: false, guest: true }],
  }
  act(() => socket.onmessage?.({ data: JSON.stringify(base) }))
  expect(screen.getByText('プレイヤー 1人が参加中')).toBeTruthy()
  act(() =>
    socket.onmessage?.({
      data: JSON.stringify({
        ...base,
        phase: 'locked',
        participants: Array.from({ length: 100 }, (_, i) => ({
          id: String(i),
          name: String(i),
          bot: i > 0,
          guest: i === 0,
        })),
      }),
    }),
  )
  expect(screen.getByText('プレイヤー 1人・ボット 99体')).toBeTruthy()
  view.unmount()
  expect(socket.send).toHaveBeenCalledWith('{"type":"leave"}')
  expect(socket.close).toHaveBeenCalled()
})
test('二重参加拒否と再試行を処理する', async () => {
  render(<LobbyPanel user={user} onLeave={vi.fn()} />)
  const socket = await connection()
  act(() => {
    socket.readyState = 3
    socket.onclose?.({ reason: 'already_connected' })
  })
  expect(screen.getByRole('alert').textContent).toContain('別のタブ')
  fireEvent.click(screen.getByRole('button', { name: '再試行' }))
  await waitFor(() => expect(Socket.instances).toHaveLength(2))
  expect(fetch).toHaveBeenCalledTimes(2)
})
