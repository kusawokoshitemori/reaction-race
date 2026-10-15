import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import {
  closeMessage,
  parseRoom,
  parseTicket,
  remainingSeconds,
} from '../lobby'
import type { LobbyState, Room } from '../lobby'
import './LobbyPanel.css'
import GamePanel from './GamePanel'

export default function LobbyPanel({
  user,
  onLeave,
  onComplete,
  active = true,
}: {
  user: Pick<User, 'getIdToken'>
  onLeave: () => void
  onComplete?: (room: Room) => void
  active?: boolean
}) {
  const socketRef = useRef<WebSocket | null>(null)
  const completed = useRef(false)
  const completeRef = useRef(onComplete)
  useEffect(() => {
    completeRef.current = onComplete
  }, [onComplete])
  const tap = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN)
      socketRef.current.send(JSON.stringify({ type: 'tap' }))
  }, [])
  const userRef = useRef(user)
  useEffect(() => {
    userRef.current = user
  }, [user])
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LobbyState>({
    status: 'connecting',
    room: null,
    error: '',
  })
  const [receivedAt, setReceivedAt] = useState(0)
  const [now, setNow] = useState(0)
  useEffect(() => {
    let disposed = false
    let socket: WebSocket | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    const abort = new AbortController()
    function fail(error: string) {
      if (disposed) return
      clearTimeout(timeout)
      setState((previous) => ({ ...previous, status: 'error', error }))
    }
    async function connect() {
      timeout = setTimeout(() => {
        fail('接続がタイムアウトしました。再試行してください。')
        abort.abort()
        socket?.close()
      }, 15000)
      try {
        async function ticket(refresh: boolean) {
          const token = await userRef.current.getIdToken(refresh)
          if (disposed || abort.signal.aborted) throw new Error('canceled')
          return fetch('/api/ws-ticket', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            signal: abort.signal,
          })
        }
        let response = await ticket(false)
        if (response.status === 401) response = await ticket(true)
        if (!response.ok) throw new Error('ticket failed')
        const data: unknown = await response.json()
        if (disposed || abort.signal.aborted) return
        const value = parseTicket(data)
        const url = new URL('/api/lobby', window.location.href)
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        url.searchParams.set('ticket', value)
        socket = new WebSocket(url)
        socketRef.current = socket
        socket.onopen = () => {
          if (!disposed) socket?.send(JSON.stringify({ type: 'join' }))
        }
        socket.onmessage = (event) => {
          if (disposed) return
          try {
            const room = parseRoom(event.data)
            clearTimeout(timeout)
            const received = performance.now()
            setReceivedAt(received)
            setNow(received)
            setState({ status: 'connected', room, error: '' })
            if (room.phase === 'finished' && !completed.current) {
              completed.current = true
              completeRef.current?.(room)
            }
          } catch {
            fail('待機室の情報を読み取れませんでした。再試行してください。')
            socket?.close()
          }
        }
        socket.onclose = (event) => fail(closeMessage(event.reason))
        socket.onerror = () =>
          fail('待機室に接続できません。再試行してください。')
      } catch {
        if (!disposed)
          fail('待機室に接続できません。通信環境を確認して再試行してください。')
      }
    }
    void connect()
    const interval = setInterval(() => setNow(performance.now()), 250)
    return () => {
      disposed = true
      abort.abort()
      clearTimeout(timeout)
      clearInterval(interval)
      if (socket?.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: 'leave' }))
      socket?.close()
      socketRef.current = null
    }
  }, [attempt])
  const room = state.room
  const locked = room?.phase === 'locked'
  const humans = room?.participants.filter((p) => !p.bot).length ?? 0
  const bots = room?.participants.filter((p) => p.bot).length ?? 0
  if (
    room &&
    ['ready', 'signal', 'settling'].includes(room.phase) &&
    state.status === 'connected'
  )
    return (
      <GamePanel key={room.matchId} room={room} active={active} onTap={tap} />
    )
  return (
    <section className="lobby-panel" aria-labelledby="lobby-heading">
      <div className="lobby-topline">
        <span>REACTION RACE / 待機室</span>
        <span>100人戦</span>
      </div>
      <div className="lobby-card">
        <p className="lobby-eyebrow">
          {locked ? 'ROSTER CONFIRMED' : 'WAITING FOR PLAYERS'}
        </p>
        <h2 id="lobby-heading">
          {locked ? '対戦メンバーが揃いました' : '一瞬を競う、仲間を待つ。'}
        </h2>
        <div className="lobby-count">
          <strong>{room?.participants.length ?? '—'}</strong>
          <span>/ 100</span>
        </div>
        <p role="status">
          {state.status === 'connecting'
            ? '待機室に接続しています…'
            : state.status === 'error'
              ? '接続を確認してください'
              : locked
                ? `プレイヤー ${humans}人・ボット ${bots}体`
                : `プレイヤー ${humans}人が参加中`}
        </p>
        {state.status === 'connected' && room && !locked && (
          <p className="lobby-countdown">
            {remainingSeconds(room, now - receivedAt) > 0
              ? `あと ${remainingSeconds(room, now - receivedAt)} 秒でメンバー確定`
              : 'メンバーを確定しています…'}
            <small>空き枠にはボットが参加します。</small>
          </p>
        )}
        {locked && <p className="lobby-note">まもなく試合が始まります。</p>}
        {state.error && (
          <div className="lobby-error" role="alert">
            <p>{state.error}</p>
            <button
              onClick={() => {
                setState({ status: 'connecting', room: null, error: '' })
                setAttempt((value) => value + 1)
              }}
            >
              再試行
            </button>
          </div>
        )}
        {room && (
          <>
            <div className="lobby-seats" aria-hidden="true">
              {Array.from({ length: 100 }, (_, index) => (
                <span
                  key={index}
                  className={
                    room.participants[index]
                      ? room.participants[index].bot
                        ? 'bot'
                        : 'human'
                      : ''
                  }
                />
              ))}
            </div>
            <p className="lobby-legend">
              ● プレイヤー　● <span>ボット</span>　○ 空き枠
            </p>
            <details>
              <summary>参加者一覧（{room.participants.length}人）</summary>
              <ul>
                {room.participants.map((p) => (
                  <li key={p.id}>
                    {p.name}
                    <span>
                      {p.bot ? 'BOT' : p.guest ? 'ゲスト' : 'プレイヤー'}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>
      <button className="secondary lobby-leave" onClick={onLeave}>
        退出してタイトルへ
      </button>
    </section>
  )
}
