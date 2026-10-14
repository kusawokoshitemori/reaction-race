import { afterEach, expect, test, vi } from 'vitest'
import { fetchProfile } from './auth'

const profile = {
  uid: 'alice',
  displayName: 'Alice',
  guest: false,
  provider: 'google.com',
}
const user = {
  uid: 'alice',
  isAnonymous: false,
  getIdToken: vi.fn(async () => 'test-token'),
}
afterEach(() => {
  vi.unstubAllGlobals()
  user.getIdToken.mockClear()
})

test('検証済みのプロフィールを返す', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(profile)),
  )
  await expect(fetchProfile(user)).resolves.toEqual(profile)
})

test.each([
  null,
  [],
  {},
  { ...profile, uid: 1 },
  { ...profile, displayName: null },
  { ...profile, guest: 'false' },
  { ...profile, provider: undefined },
  { ...profile, provider: 1 },
  { ...profile, uid: 'someone-else' },
  { ...profile, guest: true },
])('不正なAPI応答や本人情報の不一致を拒否する: %j', async (body) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(body)),
  )
  await expect(fetchProfile(user)).rejects.toEqual({ code: 'api/unavailable' })
})

test('401時だけトークンを強制更新し一度再試行する', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(Response.json(profile))
  vi.stubGlobal('fetch', request)
  await expect(fetchProfile(user)).resolves.toEqual(profile)
  expect(user.getIdToken.mock.calls).toEqual([[false], [true]])
  expect(request).toHaveBeenCalledTimes(2)
})

test('再試行後も401なら本人確認の失敗を返す', async () => {
  const request = vi.fn(async () => new Response(null, { status: 401 }))
  vi.stubGlobal('fetch', request)
  await expect(fetchProfile(user)).rejects.toEqual({ code: 'api/unauthorized' })
  expect(request).toHaveBeenCalledTimes(2)
})
