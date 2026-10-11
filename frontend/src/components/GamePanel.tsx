import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Action, Outcome, Phase } from '../navigation'
import { INPUT_WINDOW_MS, judgeInput } from '../game'
import './GamePanel.css'

type Props = {
  phase: Phase | null
  outcome: Outcome | null
  active: boolean
  onAction: (action: Action) => void
  onRecord: (milliseconds: number | null) => void
  onResult: () => void
}

export default function GamePanel({
  phase,
  outcome,
  active,
  onAction,
  onRecord,
  onResult,
}: Props) {
  const arena = useRef<HTMLElement>(null)
  const signalAt = useRef<number | null>(null)
  const accepted = useRef(false)
  const [reactionMs, setReactionMs] = useState<number | null>(null)
  const [interrupted, setInterrupted] = useState(false)
  const finished = phase === 'submitted' || phase === 'settling'
  const cut = finished && outcome === 'success'

  useLayoutEffect(() => {
    if (phase === 'signal') signalAt.current = performance.now()
    if (phase === 'ready') {
      signalAt.current = null
      accepted.current = false
      arena.current?.focus({ preventScroll: true })
    }
  }, [phase])

  useEffect(() => {
    if (!active) return
    const delay =
      phase === 'ready'
        ? 2000 + Math.random() * 3000
        : phase === 'signal'
          ? INPUT_WINDOW_MS
          : phase === 'submitted'
            ? 1300
            : null
    if (delay === null) return
    const timer = window.setTimeout(() => {
      onAction(
        phase === 'ready'
          ? 'signal'
          : phase === 'signal'
            ? 'timeout'
            : 'settle',
      )
    }, delay)
    return () => window.clearTimeout(timer)
  }, [phase, active, onAction])

  useEffect(() => {
    if (phase !== 'ready' && phase !== 'signal') return
    function interrupt() {
      accepted.current = true
      setInterrupted(true)
      onAction('interrupt')
    }
    if (!active || document.hidden) {
      interrupt()
      return
    }
    function visibility() {
      if (document.hidden) interrupt()
    }
    function input() {
      if (accepted.current || document.hidden) return
      accepted.current = true
      const record = judgeInput(signalAt.current, performance.now())
      setReactionMs(record.reactionMs)
      onRecord(record.reactionMs)
      onAction(record.outcome === 'no-record' ? 'timeout' : 'tap')
    }
    function isControl(target: EventTarget | null) {
      return (
        target instanceof Element &&
        Boolean(
          target.closest(
            'a, button, input, textarea, select, [contenteditable="true"], [role="button"]',
          ),
        )
      )
    }
    function pointer(event: PointerEvent) {
      if (event.button !== 0 || !event.isPrimary || isControl(event.target))
        return
      event.preventDefault()
      input()
    }
    function keyboard(event: KeyboardEvent) {
      if (
        event.code !== 'Space' ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isControl(event.target)
      )
        return
      event.preventDefault()
      if (!event.repeat) input()
    }
    window.addEventListener('pointerdown', pointer)
    window.addEventListener('keydown', keyboard)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('pointerdown', pointer)
      window.removeEventListener('keydown', keyboard)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [phase, active, onAction, onRecord])

  const title =
    phase === 'waiting'
      ? '一瞬に、集中。'
      : phase === 'ready'
        ? '構え'
        : phase === 'signal'
          ? '!'
          : cut
            ? '一閃'
            : outcome === 'flying'
              ? 'お手つき'
              : interrupted
                ? '中断'
                : '時間切れ'
  const subtitle =
    phase === 'waiting'
      ? '合図が出たら、ひと押し。'
      : phase === 'ready'
        ? 'まだ押さずに、合図を待て。'
        : phase === 'signal'
          ? '今だ！'
          : cut
            ? 'その一瞬を、記録した。'
            : outcome === 'flying'
              ? '早すぎた。次は「!」を待とう。'
              : interrupted
                ? '画面を離れたため、記録はありません。'
                : '3秒以内の入力がありませんでした。'

  return (
    <section
      ref={arena}
      tabIndex={-1}
      className={`game-panel phase-${phase}${cut ? ' has-cut' : ''}`}
      aria-label="反応速度ゲーム"
      aria-describedby="game-instructions"
    >
      <div className="game-topline">
        <span>
          REACTION RACE <b>/ 一閃</b>
        </span>
        <span className="game-match-label">100人戦</span>
      </div>
      <div className="game-scene">
        <div className="game-sun" aria-hidden="true" />
        <div className="game-mountain mountain-back" aria-hidden="true" />
        <div className="game-mountain mountain-front" aria-hidden="true" />
        <div className="game-field" aria-hidden="true" />
        <div
          className="game-status"
          role="status"
          aria-live="assertive"
          aria-atomic="true"
        >
          <h2 key={title}>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="game-dummy" aria-hidden="true">
          <svg viewBox="0 0 240 300" fill="none">
            <ellipse cx="120" cy="280" rx="85" ry="12" fill="#282b222b" />
            <path d="M116 148h10v130h-10z" fill="#60472e" />
            <g className="dummy-bottom">
              <path
                d="M87 148h66l13 65-46-12-43 12z"
                fill="#c5a25c"
                stroke="#735335"
                strokeWidth="3"
              />
              <path
                d="m93 158-6 42m19-40-4 40m18-40v34m14-34 4 40m8-39 9 39"
                stroke="#e6ca81"
                strokeWidth="4"
              />
              <path d="M85 155h70" stroke="#514d39" strokeWidth="9" />
            </g>
            <g className="dummy-top">
              <path
                d="m30 119 179-9"
                stroke="#644c31"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <path
                d="m76 106 34-13h25l32 14 30 8-8 25-37-13 1 20H86l2-22-37 16-9-23z"
                fill="#d9b66a"
                stroke="#735335"
                strokeWidth="3"
              />
              <path
                d="m63 115 7 19m8-25 6 18m77-17-6 17m18-13-7 18"
                stroke="#f1d88d"
                strokeWidth="4"
              />
              <path
                d="M91 53q29-23 58 0v29q-3 24-29 25-27-1-29-25z"
                fill="#ebd598"
                stroke="#735335"
                strokeWidth="3"
              />
              <path
                d="m103 70 8 8m0-8-8 8m27-8 8 8m0-8-8 8m-29 10q12 8 23-1"
                stroke="#65513b"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="m69 57 51-34 50 33q-48 16-101 1Z"
                fill="#a58046"
                stroke="#735335"
                strokeWidth="3"
              />
              <path
                d="m92 53 29-25 23 25m-38 1 15-26 8 27"
                stroke="#d0ac63"
                strokeWidth="3"
              />
              <path d="M86 139h69" stroke="#514d39" strokeWidth="7" />
              <path d="m118 142 18 28 12-7-16-21" fill="#aa553c" />
            </g>
          </svg>
          {cut && <div className="game-slash" />}
        </div>
        <div
          className="game-timeboard"
          aria-label={
            reactionMs === null
              ? '反応時間 記録なし'
              : `反応時間 ${reactionMs}ミリ秒`
          }
        >
          <span>反応時間</span>
          <strong>
            {reactionMs === null ? '—.———' : (reactionMs / 1000).toFixed(3)}
          </strong>
          <small>秒 / SEC</small>
        </div>
      </div>
      <div className="game-bottom">
        <p id="game-instructions">
          <span className="game-input-dot" />
          画面のどこでもクリック <span className="game-or">or</span>{' '}
          <kbd>SPACE</kbd>
          <span className="game-touch-copy">タップでも操作できます</span>
        </p>
        {phase === 'waiting' ? (
          <button
            className="game-ready-button"
            onClick={() => onAction('start')}
          >
            構える <span aria-hidden="true">→</span>
          </button>
        ) : phase === 'settling' ? (
          <button className="game-ready-button" onClick={onResult}>
            結果を見る <span aria-hidden="true">→</span>
          </button>
        ) : (
          <span className="game-stage-label">
            {phase === 'submitted' ? '記録を確認中…' : '「!」が出たら入力'}
          </span>
        )}
      </div>
    </section>
  )
}
