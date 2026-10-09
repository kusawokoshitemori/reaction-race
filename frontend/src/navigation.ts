export type Route =
  '/' | '/game' | '/result' | '/auth' | '/history' | '/ranking'
export type Phase = 'waiting' | 'ready' | 'signal' | 'submitted' | 'settling'
export type Outcome = 'success' | 'flying' | 'no-record'
export type Session = {
  entered: boolean
  signedIn: boolean
  phase: Phase | null
  outcome: Outcome | null
  result: Outcome | null
}
export const initialSession: Session = {
  entered: false,
  signedIn: false,
  phase: null,
  outcome: null,
  result: null,
}
const routes: Route[] = [
  '/',
  '/game',
  '/result',
  '/auth',
  '/history',
  '/ranking',
]
export function resolveRoute(
  hash: string,
  session: Session,
): { route: Route; reason?: string } {
  const path = hash.replace(/^#/, '') || '/'
  if (!session.entered && path !== '/auth') return { route: '/auth' }
  const route = routes.find((candidate) => candidate === path)
  if (!route)
    return { route: '/', reason: '存在しない画面です。タイトルへ戻りました。' }
  if (path === '/game' && !session.phase)
    return {
      route: '/',
      reason: '参加中の試合がありません。もう一度参加してください。',
    }
  if (path === '/result' && !session.result)
    return { route: '/', reason: '表示できる試合結果がありません。' }
  if (path === '/history' && !session.signedIn)
    return { route: '/auth', reason: '戦績を見るには仮ログインしてください。' }
  return { route }
}
export type Action =
  | 'join'
  | 'leave'
  | 'start'
  | 'signal'
  | 'tap'
  | 'timeout'
  | 'settle'
  | 'finish'
  | 'login'
  | 'logout'
  | 'guest'
export function transition(session: Session, action: Action): Session {
  switch (action) {
    case 'guest':
      return { ...session, entered: true }
    case 'login':
      return { ...session, entered: true, signedIn: true }
    case 'logout':
      return { ...initialSession }
    case 'join':
      return { ...session, phase: 'waiting', outcome: null, result: null }
    case 'leave':
      return { ...session, phase: null, outcome: null }
    case 'start':
      return session.phase === 'waiting'
        ? { ...session, phase: 'ready' }
        : session
    case 'signal':
      return session.phase === 'ready'
        ? { ...session, phase: 'signal' }
        : session
    case 'tap':
      return session.phase === 'ready' || session.phase === 'signal'
        ? {
            ...session,
            phase: 'submitted',
            outcome: session.phase === 'ready' ? 'flying' : 'success',
          }
        : session
    case 'timeout':
      return session.phase === 'signal'
        ? { ...session, phase: 'settling', outcome: 'no-record' }
        : session
    case 'settle':
      return session.phase === 'submitted'
        ? { ...session, phase: 'settling' }
        : session
    case 'finish':
      return session.phase === 'settling' && session.outcome
        ? { ...session, phase: null, result: session.outcome }
        : session
  }
}
