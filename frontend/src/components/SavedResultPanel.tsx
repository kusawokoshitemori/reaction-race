import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { isRating } from '../lobby'
import type { MatchResult, MatchStanding } from '../result'
import ResultPanel from './ResultPanel'

export default function SavedResultPanel({
  result,
  standings,
  user,
  onRematch,
}: {
  result: MatchResult
  standings: MatchStanding[]
  user: Pick<User, 'getIdToken'>
  onRematch: () => void
}) {
  const [current, setCurrent] = useState(result)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (
      !result.matchId ||
      result.persistence === 'saved' ||
      result.persistence === 'failed'
    )
      return
    const abort = new AbortController()
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    async function poll() {
      try {
        async function request(refresh: boolean) {
          const token = await user.getIdToken(refresh)
          if (disposed) throw new Error('canceled')
          return fetch(
            `/api/matches/${encodeURIComponent(result.matchId ?? '')}/rating`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.any([
                abort.signal,
                AbortSignal.timeout(10000),
              ]),
            },
          )
        }
        let response = await request(false)
        if (response.status === 401) response = await request(true)
        if (response.status === 404) {
          if (!disposed)
            setError(
              '保存状態を確認できません。サーバー再起動や保持期限切れの可能性があります。',
            )
          return
        }
        if (!response.ok) throw new Error('status unavailable')
        const data: unknown = await response.json()
        if (disposed) return
        if (
          typeof data !== 'object' ||
          data === null ||
          !('persistence' in data) ||
          !('rating' in data) ||
          (data.persistence !== 'pending' &&
            data.persistence !== 'retrying' &&
            data.persistence !== 'failed' &&
            data.persistence !== 'saved') ||
          (data.rating !== null && !isRating(data.rating))
        )
          throw new Error('invalid status')
        if (
          data.persistence === 'saved' &&
          !result.guest &&
          data.rating === null
        )
          throw new Error('missing rating')
        setError('')
        setCurrent({
          ...result,
          persistence: data.persistence,
          rating: data.persistence === 'saved' ? data.rating : null,
        })
        if (data.persistence === 'saved' || data.persistence === 'failed')
          return
      } catch {
        if (disposed) return
        setError(
          '保存状態を取得できません。通信を確認しながら自動で再試行します。',
        )
      }
      if (!disposed) timer = setTimeout(() => void poll(), 3000)
    }
    void poll()
    return () => {
      disposed = true
      abort.abort()
      clearTimeout(timer)
    }
  }, [result, user, attempt])
  return (
    <>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => setAttempt((n) => n + 1)}>
            保存状態を再確認
          </button>
        </div>
      )}
      <ResultPanel
        result={current}
        standings={standings}
        onRematch={onRematch}
      />
    </>
  )
}
