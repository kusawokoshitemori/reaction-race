import { test, expect } from 'vitest'
import { initialSession, transition, resolveRoute } from './navigation'

test('匿名認証への切り替えで登録ユーザーの権限を引き継がない', () => {
  const loggedIn = transition(initialSession, 'login')
  const guest = transition(loggedIn, 'guest')
  expect(guest.signedIn).toBe(false)
  expect(resolveRoute('#/history', guest).route).toBe('/auth')
  expect(transition(loggedIn, 'logout').entered).toBe(false)
})
