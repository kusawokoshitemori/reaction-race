import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'

export type ReaderUser = Pick<User, 'getIdToken'>
export type RecordEntry = {
  participantId: string
  name: string
  bot: boolean
  guest: boolean
  outcome: 'success' | 'flying' | 'no-record'
  rank: number | null
  reactionMs: number | null
  measurement: string
  ratingBefore: number | null
  ratingAfter: number | null
}
export type HistoryEntry = RecordEntry & { matchId: string; finishedAt: string }
export type History = { entries: HistoryEntry[]; hasMore: boolean }
export type Detail = {
  matchId: string
  finishedAt: string
  entries: RecordEntry[]
}
export type Leader = {
  id: string
  name: string
  rating: number
  rank: number
  self: boolean
}
function object(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
function nullableNumber(v: unknown) {
  return v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0)
}
function entry(v: unknown): v is RecordEntry {
  return (
    object(v) &&
    typeof v.participantId === 'string' &&
    typeof v.name === 'string' &&
    typeof v.bot === 'boolean' &&
    typeof v.guest === 'boolean' &&
    ['success', 'flying', 'no-record'].includes(String(v.outcome)) &&
    nullableNumber(v.rank) &&
    nullableNumber(v.reactionMs) &&
    typeof v.measurement === 'string' &&
    nullableNumber(v.ratingBefore) &&
    nullableNumber(v.ratingAfter)
  )
}
function dated(v: unknown): v is { matchId: string; finishedAt: string } {
  return (
    object(v) &&
    typeof v.matchId === 'string' &&
    typeof v.finishedAt === 'string' &&
    Number.isFinite(Date.parse(v.finishedAt))
  )
}
export function isHistory(v: unknown): v is History {
  return (
    object(v) &&
    Array.isArray(v.entries) &&
    v.entries.every((e) => entry(e) && dated(e)) &&
    typeof v.hasMore === 'boolean'
  )
}
export function isDetail(v: unknown): v is Detail {
  return (
    object(v) &&
    dated(v) &&
    'entries' in v &&
    Array.isArray(v.entries) &&
    v.entries.every(entry)
  )
}
export function isRanking(v: unknown): v is Leader[] {
  return (
    Array.isArray(v) &&
    v.every(
      (e) =>
        object(e) &&
        typeof e.id === 'string' &&
        typeof e.name === 'string' &&
        typeof e.rating === 'number' &&
        Number.isInteger(e.rating) &&
        e.rating >= 0 &&
        typeof e.rank === 'number' &&
        Number.isInteger(e.rank) &&
        e.rank > 0 &&
        typeof e.self === 'boolean',
    )
  )
}
class RecordsError extends Error {}

export async function readRecords<T>(
  user: ReaderUser,
  path: string,
  signal: AbortSignal,
  guard: (v: unknown) => v is T,
): Promise<T> {
  async function request(refresh: boolean) {
    const token = await user.getIdToken(refresh)
    signal.throwIfAborted()
    return fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
  }
  let response = await request(false)
  if (response.status === 401) response = await request(true)
  if (!response.ok)
    throw new RecordsError(
      response.status === 404
        ? '試合が見つからないか、閲覧権限がありません。'
        : response.status === 403
          ? '登録アカウントでログインしてください。'
          : 'データを取得できませんでした。再読み込みしてください。',
    )
  const data: unknown = await response.json()
  if (!guard(data))
    throw new RecordsError('データの形式を確認できませんでした。')
  return data
}
export function useRecords<T>(
  user: ReaderUser,
  path: string,
  guard: (v: unknown) => v is T,
) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{
    attempt: number
    path: string
    user: ReaderUser
    data?: T
    error?: string
  }>()
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void readRecords(
      user,
      path,
      AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
      guard,
    )
      .then((data) => {
        if (active) setState({ path, user, attempt, data })
      })
      .catch((cause: unknown) => {
        if (active)
          setState({
            path,
            user,
            attempt,
            error:
              cause instanceof RecordsError
                ? cause.message
                : cause instanceof DOMException && cause.name === 'TimeoutError'
                  ? '時間内に応答がありませんでした。再読み込みしてください。'
                  : 'データを取得できませんでした。再読み込みしてください。',
          })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [user, path, guard, attempt])
  const current =
    state?.path === path && state.user === user && state.attempt === attempt
      ? state
      : undefined
  return {
    data: current?.data,
    error: current?.error,
    retry: () => setAttempt((n) => n + 1),
  }
}
