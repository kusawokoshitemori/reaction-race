import { useEffect, useRef, useState } from 'react'
import { initialSession, resolveRoute, transition } from './navigation'
import type { Action, Outcome, Route, Session } from './navigation'
import AppHeader from './components/AppHeader'
import AppFooter from './components/AppFooter'
import HelpContent from './components/HelpContent'
import RatingPanel from './components/RatingPanel'
import RankingPanel from './components/RankingPanel'
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
const outcomes: Record<Outcome, string> = {
  success: '成功：12位 / 100人・反応時間 240 ms',
  flying: 'フライング：順位・記録なし',
  'no-record': '未入力：記録なし',
}
function log(event: string, details: Record<string, unknown>) {
  console.info('[navigation]', { event, ...details })
}

export default function App() {
  const sessionRef = useRef<Session>({ ...initialSession })
  const [session, setSession] = useState<Session>({ ...initialSession })
  const [route, setRoute] = useState<Route>('/auth')
  const [helpOpen, setHelpOpen] = useState(false)
  const helpHeading = useRef<HTMLHeadingElement>(null)
  const [notice, setNotice] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const rankingHeading = useRef<HTMLHeadingElement>(null)
  const rankingButton = useRef<HTMLButtonElement>(null)
  const previousRoute = useRef<Route>('/auth')
  const rankingOpen = route === '/ranking'
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
        : `${labels[route]} | Reaction Race`
    if (helpOpen) helpHeading.current?.focus()
    else if (route === '/ranking') rankingHeading.current?.focus()
    else if (previousRoute.current === '/ranking' && route === '/')
      rankingButton.current?.focus()
    else heading.current?.focus()
    previousRoute.current = route
  }, [route, helpOpen])

  function act(action: Action, destination?: Route) {
    const next = transition(sessionRef.current, action)
    sessionRef.current = next
    setSession(next)
    log('action', { action, from: session.phase, to: next.phase })
    if (destination) window.location.hash = destination
  }

  return (
    <div className={`shell${isStart && !helpOpen ? ' start-screen' : ''}`}>
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
          <div className="page-heading">
            {route === '/' && (
              <p className="start-kicker">100 PLAYERS / ONE SIGNAL</p>
            )}
            <h1 ref={heading} tabIndex={-1}>
              {route === '/' ? (
                <>
                  REACTION <span>RACE</span>
                </>
              ) : (
                labels[route]
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
            <section aria-live="polite">
              {session.phase === 'waiting' && (
                <>
                  <h2>参加者を募集中</h2>
                  <p>仮の待機室です。不足人数はボットで補う想定です。</p>
                  <button onClick={() => act('start')}>
                    募集を終了して開始（仮）
                  </button>
                </>
              )}
              {session.phase === 'ready' && (
                <>
                  <h2>合図を待ってください</h2>
                  <button onClick={() => act('tap')}>押す（フライング）</button>
                  <button onClick={() => act('signal')}>
                    合図を出す（仮）
                  </button>
                </>
              )}
              {session.phase === 'signal' && (
                <>
                  <h2>今だ！</h2>
                  <button onClick={() => act('tap')}>押す</button>
                  <button onClick={() => act('timeout')}>
                    3秒経過・未入力（仮）
                  </button>
                </>
              )}
              {session.phase === 'submitted' && (
                <>
                  <h2>入力を受け付けました</h2>
                  <p>
                    {session.outcome === 'flying'
                      ? 'フライングです。'
                      : '他の参加者の入力を待っています。'}
                  </p>
                  <button onClick={() => act('settle')}>
                    入力受付を終了（仮）
                  </button>
                </>
              )}
              {session.phase === 'settling' && (
                <>
                  <h2>結果を確定中</h2>
                  <p>遅延補正・順位計算・保存を行う想定です。</p>
                  <button onClick={() => act('finish', '/result')}>
                    確定結果を表示（仮）
                  </button>
                </>
              )}
            </section>
          )}
          {route === '/result' && session.result && (
            <section>
              <h2>あなたの仮結果</h2>
              <p>{outcomes[session.result]}</p>
              <p>
                {session.signedIn
                  ? `仮レート変動：${session.result === 'success' ? '+6' : '-7'}`
                  : 'ゲストにはレートがありません。'}
              </p>
              <button onClick={() => act('join', '/game')}>再戦</button>
              <a className="button secondary" href="#/">
                タイトルに戻る
              </a>
            </section>
          )}
          {route === '/auth' && (
            <section>
              {session.signedIn ? (
                <>
                  <p>デモプレイヤーとしてログイン中です。</p>
                  <p>
                    <a href="#/history">戦績を見る</a>
                  </p>
                  <button onClick={() => act('logout', '/auth')}>
                    ログアウト
                  </button>
                  <a className="button secondary" href="#/">
                    タイトルに戻る
                  </a>
                </>
              ) : (
                <>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      event.currentTarget.reset()
                      act('login', '/')
                    }}
                  >
                    <p id="auth-note">
                      画面確認用です。実際の認証は行いません。入力する場合はダミー情報を使ってください。
                    </p>
                    <label>
                      メールアドレス
                      <input
                        type="email"
                        name="email"
                        autoComplete="off"
                        placeholder="demo@example.com"
                        aria-describedby="auth-note"
                      />
                    </label>
                    <label>
                      パスワード
                      <input
                        type="password"
                        name="password"
                        autoComplete="off"
                        placeholder="ダミーパスワード"
                        aria-describedby="auth-note"
                      />
                    </label>
                    <button type="submit">ログイン</button>
                  </form>
                  <button
                    className="secondary"
                    onClick={() => act('guest', '/')}
                  >
                    ゲストで続ける
                  </button>
                </>
              )}
            </section>
          )}
          {route === '/history' && (
            <section>
              <p>デモプレイヤーの仮戦績</p>
              <ul>
                <li>サンプル試合：12位・240 ms・レート +6</li>
                {session.result && (
                  <li>今回の仮試合：{outcomes[session.result]}</li>
                )}
              </ul>
              {session.result && <a href="#/result">今回の試合結果へ</a>}
            </section>
          )}
          {route === '/history' && (
            <p className="back">
              <a href="#/">タイトルに戻る</a>
            </p>
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
