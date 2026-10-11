import { useCallback, useEffect, useRef, useState } from 'react'
import { initialSession, resolveRoute, transition } from './navigation'
import type { Action, Route, Session } from './navigation'
import AuthPanel from './components/AuthPanel'
import type { LoginProvider } from './components/AuthPanel'
import AccountPanel from './components/AccountPanel'
import HistoryPanel from './components/HistoryPanel'
import AppHeader from './components/AppHeader'
import AppFooter from './components/AppFooter'
import HelpContent from './components/HelpContent'
import RatingPanel from './components/RatingPanel'
import RankingPanel from './components/RankingPanel'
import ResultPanel from './components/ResultPanel'
import GamePanel from './components/GamePanel'
import { createDemoResult } from './result'
import { demoRanking } from './ranking'
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
  const [provider, setProvider] = useState<LoginProvider | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const helpHeading = useRef<HTMLHeadingElement>(null)
  const [reactionMs, setReactionMs] = useState<number | null>(null)
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
  }, [])

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
    if (action === 'join' || action === 'logout') setReactionMs(null)
    log('action', { action, from: previous.phase, to: next.phase })
    if (action === 'finish' && next !== previous && next.result) {
      log('result-ready', { source: 'demo', outcome: next.result })
    }
    if (destination) window.location.hash = destination
  }, [])

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
        entered={session.entered}
        signedIn={session.signedIn}
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
        {rankingOpen && !helpOpen && (
          <RankingPanel
            state={{ status: 'success', entries: demoRanking }}
            currentPlayerId={session.signedIn ? 'demo-player' : null}
            headingRef={rankingHeading}
            onRetry={() => log('ranking-retry', { source: 'demo' })}
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
          {route === '/game' && (
            <GamePanel
              phase={session.phase}
              outcome={session.outcome}
              active={!helpOpen}
              onAction={act}
              onRecord={setReactionMs}
              onResult={() => act('finish', '/result')}
            />
          )}
          {route === '/result' && session.result && (
            <ResultPanel
              result={createDemoResult(
                session.result,
                session.signedIn,
                reactionMs ?? undefined,
              )}
              onRematch={() => act('join', '/game')}
            />
          )}
          {route === '/auth' &&
            (session.signedIn ? (
              <AccountPanel
                provider={provider}
                onLogout={() => {
                  setProvider(null)
                  act('logout', '/auth')
                }}
              />
            ) : (
              <AuthPanel
                onLogin={(value) => {
                  setProvider(value)
                  act('login', '/')
                }}
                onGuest={() => act('guest', '/')}
              />
            ))}
          {route === '/history' && (
            <HistoryPanel
              result={
                session.result
                  ? createDemoResult(
                      session.result,
                      session.signedIn,
                      reactionMs ?? undefined,
                    )
                  : null
              }
            />
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
