import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  GoogleAuthProvider,
  initializeAuth,
  browserPopupRedirectResolver,
  onIdTokenChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  TwitterAuthProvider,
} from 'firebase/auth'
import type { User } from 'firebase/auth'

export type LoginProvider = 'Google' | 'X'
export type Profile = {
  uid: string
  displayName: string
  guest: boolean
  provider: string
}
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}
const configured = Object.values(config).every(
  (value) => typeof value === 'string' && value.trim(),
)
const auth = configured
  ? initializeAuth(initializeApp(config), {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    })
  : null

function requireAuth() {
  if (!auth) throw { code: 'auth/configuration-missing' }
  return auth
}

export function observeUser(
  next: (user: User | null) => void,
  error: (error: unknown) => void,
) {
  if (!auth) {
    next(null)
    return () => {}
  }
  return onIdTokenChanged(auth, next, error)
}

export function login(provider: LoginProvider) {
  const client = requireAuth()
  // Popup is opened directly from the user's click. Never await network work first.
  return signInWithPopup(
    client,
    provider === 'Google'
      ? new GoogleAuthProvider()
      : new TwitterAuthProvider(),
  )
}
export function loginGuest() {
  const client = requireAuth()
  return client.currentUser?.isAnonymous
    ? Promise.resolve()
    : signInAnonymously(client)
}
export function logout() {
  return signOut(requireAuth())
}

export async function fetchProfile(
  user: User,
  displayName?: string,
): Promise<Profile> {
  async function request(forceRefresh: boolean) {
    const token = await user.getIdToken(forceRefresh)
    return fetch('/api/me', {
      method: displayName === undefined ? 'GET' : 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body:
        displayName === undefined ? undefined : JSON.stringify({ displayName }),
      signal: AbortSignal.timeout(15000),
    })
  }
  let response = await request(false)
  if (response.status === 401) response = await request(true)
  if (!response.ok)
    throw {
      code: response.status === 401 ? 'api/unauthorized' : 'api/unavailable',
    }
  const profile: Profile = await response.json()
  if (
    profile.uid !== user.uid ||
    profile.guest !== user.isAnonymous ||
    typeof profile.displayName !== 'string'
  )
    throw { code: 'api/unavailable' }
  return profile
}
