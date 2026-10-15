import { useCallback, useEffect, useRef, useState } from 'react'
import { initialSession, resolveRoute, transition } from './navigation'
import type { Action, Route, Session } from './navigation'
import AuthPanel from './components/AuthPanel'
import { login, loginGuest, logout } from './auth'
import { useIdentity } from './useIdentity'
import { authErrorMessage } from './authErrors'
import AccountPanel from './components/AccountPanel'
import HistoryPanel from './components/HistoryPanel'
import AppHeader from './components/AppHeader'
import AppFooter from './components/AppFooter'
import HelpContent from './components/HelpContent'
import RatingPanel from './components/RatingPanel'
import LiveRankingPanel from './components/LiveRankingPanel'
import SavedResultPanel from './components/SavedResultPanel'
import LobbyPanel from './components/LobbyPanel'
import { serverResult } from './result'
import type { Room } from './lobby'
import './App.css'

const labels: Record<Route, string> = {
  '/': 'Reaction Race',
  '/game': 'ゲーム',
  '/result': '試合結果',
  '/auth': 'ログイン',
  '/history': '戦績',
  '/ranking': 'ランキング',
}
function log(event: string, details: Record<string, unknown>) {
  console.info('[navigation]', { event, ...details })
}

export default function App() {
  const sessionRef = useRef<Session>({ ...initialSession })
  const [session, setSession] = useState<Session>({ ...initialSession })
  const [route, setRoute] = useState<Route>('/auth')
  const identity = useIdentity()
  const identityKey = useRef<string | null>(null)
  const [logoutError, setLogoutError] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const helpHeading = useRef<HTMLHeadingElement>(null)
  const [match, setMatch] = useState<ReturnType<typeof serverResult> | null>(
    null,
  )
  const [notice, setNotice] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const rankingHeading = useRef<HTMLHeadingElement>(null)
  const rankingButton = useRef<HTMLButtonElement>(null)
  const previousRoute = useRef<Route>('/auth')
  const rankingOpen = route === '/ranking'
  const isAuth = route === '/auth' && !session.signedIn
  const pageTitle =
    route === '/auth' && session.signedIn ? 'アカウント' : labels[route]
  const isStart = route === '/' || rankingOpen

  function toggleRanking() {
    window.location.hash = rankingOpen ? '/' : '/ranking'
  }

  useEffect(() => {
    function sync() {
      if (identity.loading) return
      const key = identity.profile
        ? `${identity.profile.uid}:${identity.profile.guest}`
        : null
      if (key !== identityKey.current) return
      let next = sessionRef.current
      const resolved = resolveRoute(window.location.hash, next)
      if (resolved.route !== '/game' && next.phase) {
        next = transition(next, 'leave')
        sessionRef.current = next
        setSession(next)
        log('match-left', { reason: 'navigation' })
      }
      if (window.location.hash !== `#${resolved.route}`) {
        window.history.replaceState(null, '', `#${resolved.route}`)
      }
      setHelpOpen(false)
      setRoute(resolved.route)
      setNotice(resolved.reason ?? '')
      log('route', {
        to: resolved.route,
        reason: resolved.reason ?? 'navigation',
      })
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [identity.loading, identity.profile])

  useEffect(() => {
    document.title = helpOpen
      ? 'hogehoge | Reaction Race'
      : route === '/'
        ? 'Reaction Race'
        : `${pageTitle} | Reaction Race`
    if (helpOpen) helpHeading.current?.focus()
    else if (route === '/ranking') rankingHeading.current?.focus()
    else if (previousRoute.current === '/ranking' && route === '/')
      rankingButton.current?.focus()
    else heading.current?.focus()
    previousRoute.current = route
  }, [route, helpOpen, pageTitle])

  const act = useCallback((action: Action, destination?: Route) => {
    const previous = sessionRef.current
    const next = transition(previous, action)
    sessionRef.current = next
    setSession(next)
    if (action === 'join' || action === 'logout') setMatch(null)
    log('action', { action, from: previous.phase, to: next.phase })
    if (action === 'finish' && next !== previous && next.result) {
      log('result-ready', { source: 'demo', outcome: next.result })
    }
    if (destination) window.location.hash = destination
  }, [])

  const completeMatch = useCallback((room: Room) => {
    const match = serverResult(room)
    setMatch(match)
    const next = {
      ...sessionRef.current,
      phase: null,
      outcome: null,
      result: match.result.outcome,
    }
    sessionRef.current = next
    setSession(next)
    window.location.hash = '/result'
    log('result-ready', {
      source: 'server',
      matchId: room.matchId,
      outcome: match.result.outcome,
    })
  }, [])

  useEffect(() => {
    if (identity.loading) return
    const key = identity.profile
      ? `${identity.profile.uid}:${identity.profile.guest}`
      : null
    if (key === identityKey.current) return
    identityKey.current = key
    if (identity.profile) {
      act('logout')
      act(identity.profile.guest ? 'guest' : 'login')
      const destination =
        window.location.hash === '#/auth' || !window.location.hash
          ? '/'
          : resolveRoute(window.location.hash, sessionRef.current).route
      setRoute(destination)
      setHelpOpen(false)
      window.history.replaceState(null, '', `#${destination}`)
    } else {
      setRoute('/auth')
      act('logout', '/auth')
    }
  }, [identity.loading, identity.profile, act])

  async function handleLogout() {
    setLogoutError('')
    try {
      await logout()
    } catch (cause) {
      setLogoutError(authErrorMessage(cause))
    }
  }

  if (identity.loading && !identity.profile)
    return (
      <main className="shell">
        <p role="status">ログイン状態を確認しています…</p>
      </main>
    )
  if (identity.error)
    return (
      <main className="shell">
        <p role="alert">{identity.error}</p>
        <button onClick={identity.retry}>再試行</button>
        {identity.user && (
          <button className="secondary" onClick={handleLogout}>
            ログアウト
          </button>
        )}
        {logoutError && <p role="alert">{logoutError}</p>}
      </main>
    )

  return (
    <div
      className={`shell${isStart && !helpOpen ? ' start-screen' : ''}${isAuth && !helpOpen ? ' auth-screen' : ''}${route === '/game' && !helpOpen ? ' game-screen' : ''}`}
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          ;(helpOpen
            ? helpHeading
            : rankingOpen
              ? rankingHeading
              : heading
          ).current?.focus()
        }}
      >
        本文へ移動
      </a>
      <AppHeader
        accountOpen={route === '/auth' && !helpOpen}
        entered={session.entered}
        signedIn={session.signedIn}
        displayName={identity.profile?.displayName}
        showBack={helpOpen || (session.entered && !isStart)}
        backLabel={helpOpen ? '元の画面に戻る' : 'タイトルに戻る'}
        onBack={() => (helpOpen ? setHelpOpen(false) : act('leave', '/'))}
        onAccount={() => setHelpOpen(false)}
      />
      <main id="main-content">
        {helpOpen && (
          <div id="help-content" className="help-content">
            <h1 ref={helpHeading} tabIndex={-1}>
              hogehoge
            </h1>
            <HelpContent />
          </div>
        )}
        {rankingOpen && !helpOpen && identity.user && (
          <LiveRankingPanel
            key={identity.user.uid}
            user={identity.user}
            guest={!session.signedIn}
            headingRef={rankingHeading}
          />
        )}
        <div className="page-content" hidden={helpOpen || rankingOpen}>
          <div
            className={`page-heading${isAuth || route === '/game' ? ' visually-hidden' : ''}`}
          >
            {route === '/' && (
              <p className="start-kicker">100 PLAYERS / ONE SIGNAL</p>
            )}
            <h1 ref={heading} tabIndex={-1}>
              {route === '/' ? (
                <>
                  REACTION <span>RACE</span>
                </>
              ) : (
                pageTitle
              )}
            </h1>
          </div>
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          {route === '/' && (
            <section className="start-actions" aria-label="ゲームへの参加">
              <button
                className="start-button"
                onClick={() => act('join', '/game')}
              >
                ゲーム開始 <span aria-hidden="true">→</span>
              </button>
              <RatingPanel
                rating={session.signedIn ? 1500 : null}
                matches={12}
              />
              {session.signedIn && (
                <p className="rating-demo-note">レート・試合数は仮データです</p>
              )}
            </section>
          )}
          {route === '/game' && identity.user && (
            <LobbyPanel
              active={!helpOpen}
              key={identity.user.uid}
              user={identity.user}
              onLeave={() => act('leave', '/')}
              onComplete={completeMatch}
            />
          )}
          {route === '/result' && match && identity.user && (
            <SavedResultPanel
              key={`${identity.user.uid}:${match.result.matchId}`}
              user={identity.user}
              result={match.result}
              standings={match.standings}
              onRematch={() => act('join', '/game')}
            />
          )}
          {route === '/auth' &&
            (session.signedIn ? (
              identity.profile && (
                <AccountPanel
                  profile={identity.profile}
                  onRename={identity.rename}
                  onLogout={logout}
                />
              )
            ) : (
              <AuthPanel
                onLogin={login}
                onGuest={async () => {
                  await loginGuest()
                  if (identity.profile?.guest) act('guest', '/')
                }}
                disabled={identity.loading}
              />
            ))}
          {route === '/history' && identity.user && (
            <HistoryPanel key={identity.user.uid} user={identity.user} />
          )}
        </div>
      </main>
      <AppFooter
        helpOpen={helpOpen}
        showRanking={isStart && !helpOpen}
        rankingOpen={rankingOpen}
        rankingButtonRef={rankingButton}
        onToggleRanking={toggleRanking}
        onToggleHelp={() => setHelpOpen((value) => !value)}
      />
    </div>
  )
}
