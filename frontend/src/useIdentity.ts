import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { fetchProfile, observeUser } from './auth'
import type { Profile } from './auth'
import { authErrorMessage } from './authErrors'

export function useIdentity() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const revision = useRef({ value: 0 })
  useEffect(() => {
    const sequence = revision.current
    // A token refresh does not change the profile. Re-fetch only when the
    // identity changes; a new subscription also allows explicit retry.
    let loadedIdentity: string | null = null
    const unsubscribe = observeUser(
      async (nextUser) => {
        setUser(nextUser)
        const key = nextUser ? `${nextUser.uid}:${nextUser.isAnonymous}` : null
        if (key !== null && key === loadedIdentity) return
        loadedIdentity = null
        const current = ++sequence.value
        setProfile((previous) =>
          previous?.uid === nextUser?.uid ? previous : null,
        )
        setLoading(true)
        setError('')
        try {
          const nextProfile = nextUser ? await fetchProfile(nextUser) : null
          if (current === sequence.value) {
            loadedIdentity = key
            setProfile(nextProfile)
          }
        } catch (cause) {
          if (current === sequence.value) {
            setProfile(null)
            setError(authErrorMessage(cause))
          }
        } finally {
          if (current === sequence.value) setLoading(false)
        }
      },
      (cause) => {
        sequence.value++
        loadedIdentity = null
        setProfile(null)
        setError(authErrorMessage(cause))
        setLoading(false)
      },
    )
    return () => {
      sequence.value++
      unsubscribe()
    }
  }, [attempt])
  async function rename(displayName: string) {
    if (!user) return
    const current = revision.current.value
    const updated = await fetchProfile(user, displayName)
    if (current === revision.current.value) setProfile(updated)
  }
  return {
    user,
    profile,
    loading,
    error,
    rename,
    retry: () => setAttempt((value) => value + 1),
  }
}
