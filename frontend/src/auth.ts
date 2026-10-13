import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
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
function isProfile(value: unknown): value is Profile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'uid' in value &&
    typeof value.uid === 'string' &&
    'displayName' in value &&
    typeof value.displayName === 'string' &&
    'guest' in value &&
    typeof value.guest === 'boolean' &&
    'provider' in value &&
    typeof value.provider === 'string'
  )
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
// This marker chooses which Firebase storage to restore; it is not proof of identity.
const guestSessionKey = 'reaction-race:guest-session'
const restoreGuest = sessionStorage.getItem(guestSessionKey) === '1'
const auth = configured
  ? initializeAuth(initializeApp(config), {
      persistence: restoreGuest
        ? browserSessionPersistence
        : browserLocalPersistence,
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
  const client = auth
  return onIdTokenChanged(
    client,
    (user) => {
      // Discard anonymous sessions saved by the previous local-persistence policy.
      if (
        user?.isAnonymous &&
        sessionStorage.getItem(guestSessionKey) !== '1'
      ) {
        void signOut(client).catch(error)
        return
      }
      if (user && !user.isAnonymous) sessionStorage.removeItem(guestSessionKey)
      next(user)
    },
    error,
  )
}

export function login(provider: LoginProvider) {
  const client = requireAuth()
  // Popup is opened directly from the user's click. Never await network work first.
  return signInWithPopup(
    client,
    provider === 'Google'
      ? new GoogleAuthProvider()
      : new TwitterAuthProvider(),
  ).then(async (result) => {
    // Keep the guest session tab-scoped until provider login succeeds.
    await setPersistence(client, browserLocalPersistence)
    sessionStorage.removeItem(guestSessionKey)
    return result
  })
}
export async function loginGuest() {
  const client = requireAuth()
  sessionStorage.setItem(guestSessionKey, '1')
  await setPersistence(client, browserSessionPersistence)
  if (!client.currentUser?.isAnonymous) await signInAnonymously(client)
}
export async function logout() {
  await signOut(requireAuth())
  sessionStorage.removeItem(guestSessionKey)
}

export async function fetchProfile(
  user: Pick<User, 'uid' | 'isAnonymous' | 'getIdToken'>,
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
  const profile: unknown = await response.json()
  if (
    !isProfile(profile) ||
    profile.uid !== user.uid ||
    profile.guest !== user.isAnonymous
  )
    throw { code: 'api/unavailable' }
  return profile
}
