import userEvent from '@testing-library/user-event'
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
    you: 'p',
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
        you: '0',
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

test('同一ユーザーの参照更新では退出せず、再試行は最新のトークン取得を使う', async () => {
  const view = render(<LobbyPanel user={user} onLeave={vi.fn()} />)
  const socket = await connection()
  const updated = { getIdToken: vi.fn(async () => 'updated-token') }
  view.rerender(<LobbyPanel user={updated} onLeave={vi.fn()} />)
  expect(Socket.instances).toHaveLength(1)
  expect(socket.close).not.toHaveBeenCalled()
  expect(socket.send).not.toHaveBeenCalledWith('{"type":"leave"}')
  act(() => {
    socket.readyState = 3
    socket.onclose?.({ reason: '' })
  })
  fireEvent.click(screen.getByRole('button', { name: '再試行' }))
  await waitFor(() => expect(Socket.instances).toHaveLength(2))
  expect(updated.getIdToken).toHaveBeenCalledWith(false)
  expect(fetch).toHaveBeenLastCalledWith(
    '/api/ws-ticket',
    expect.objectContaining({
      headers: { Authorization: 'Bearer updated-token' },
    }),
  )
})

test('キーボードのTabとEnterで退出を実行できる', async () => {
  const onLeave = vi.fn()
  render(<LobbyPanel user={user} onLeave={onLeave} />)
  await connection()
  const keyboard = userEvent.setup()
  await keyboard.tab()
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: '退出してタイトルへ' }),
  )
  await keyboard.keyboard('{Enter}')
  expect(onLeave).toHaveBeenCalledTimes(1)
})

test('サーバーの合図と受付確認に従い一度だけ入力し、確定結果を通知する', async () => {
  const onComplete = vi.fn()
  render(<LobbyPanel user={user} onLeave={vi.fn()} onComplete={onComplete} />)
  const socket = await connection()
  const participants = Array.from({ length: 100 }, (_, i) => ({
    id: String(i),
    name: `参加者${i}`,
    bot: i > 0,
    guest: i === 0,
  }))
  const room = {
    type: 'room',
    roomId: 'r',
    you: '0',
    matchId: 'm',
    phase: 'ready',
    deadline: 0,
    serverTime: 1000,
    capacity: 100,
    participants,
  }
  act(() => socket.onmessage?.({ data: JSON.stringify(room) }))
  expect(screen.getByRole('heading', { name: '構え' })).toBeTruthy()
  act(() =>
    socket.onmessage?.({
      data: JSON.stringify({
        ...room,
        phase: 'signal',
        signalAt: 2000,
        deadline: 5000,
      }),
    }),
  )
  expect(screen.getByRole('heading', { name: '!' })).toBeTruthy()
  fireEvent.keyDown(window, { code: 'Space' })
  fireEvent.keyDown(window, { code: 'Space' })
  expect(
    socket.send.mock.calls.filter(([message]) => message === '{"type":"tap"}'),
  ).toHaveLength(1)
  expect(screen.getByRole('heading', { name: '送信中' })).toBeTruthy()
  const input = { participantId: '0', outcome: 'success', reactionMs: 200 }
  act(() =>
    socket.onmessage?.({
      data: JSON.stringify({
        ...room,
        phase: 'signal',
        signalAt: 2000,
        deadline: 5000,
        input,
      }),
    }),
  )
  expect(screen.getByRole('heading', { name: '一閃' })).toBeTruthy()
  const finished = {
    ...room,
    phase: 'finished',
    input,
    results: participants.map((p) =>
      p.id === '0'
        ? input
        : { participantId: p.id, outcome: 'no-record', reactionMs: null },
    ),
  }
  act(() => socket.onmessage?.({ data: JSON.stringify(finished) }))
  act(() => socket.onmessage?.({ data: JSON.stringify(finished) }))
  expect(onComplete).toHaveBeenCalledTimes(1)
  expect(onComplete).toHaveBeenCalledWith(finished)
})
