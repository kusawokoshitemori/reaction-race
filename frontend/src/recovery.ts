export type Recovery = { instanceId: string; roomId: string }
const key = (uid: string) => `reaction-race:recovery:${uid}`

export function readRecovery(uid: string): Recovery | null {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(key(uid)) ?? 'null',
    )
    if (
      typeof value === 'object' &&
      value !== null &&
      'instanceId' in value &&
      typeof value.instanceId === 'string' &&
      value.instanceId &&
      'roomId' in value &&
      typeof value.roomId === 'string' &&
      value.roomId
    )
      return { instanceId: value.instanceId, roomId: value.roomId }
  } catch {
    /* Storage may be disabled; in-memory recovery still works. */
  }
  return null
}
export function saveRecovery(uid: string, value: Recovery | null) {
  try {
    if (value) sessionStorage.setItem(key(uid), JSON.stringify(value))
    else sessionStorage.removeItem(key(uid))
  } catch {
    /* A storage failure must not interrupt an active match. */
  }
}
