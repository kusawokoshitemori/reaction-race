import { useEffect, useState } from 'react'

const soundKey = 'reaction-race:sound-enabled'

type AppFooterProps = { helpOpen: boolean; onToggleHelp: () => void }

export default function AppFooter({ helpOpen, onToggleHelp }: AppFooterProps) {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem(soundKey) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(soundKey, String(soundEnabled))
    } catch {
      /* Session-only when storage is unavailable. */
    }
  }, [soundEnabled])

  return (
    <footer className="app-footer">
      <button
        className="bar-button"
        onClick={onToggleHelp}
        aria-expanded={helpOpen}
        aria-controls="help-content"
      >
        <span aria-hidden="true">?</span> 遊び方
      </button>
      <button
        className="bar-button sound-toggle"
        aria-pressed={soundEnabled}
        aria-label="音を有効にする"
        title="音の設定を保存します。BGM・効果音は今後追加予定です。"
        onClick={() => setSoundEnabled((value) => !value)}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M4 9h4l5-4v14l-5-4H4z" />
          {soundEnabled ? (
            <path d="M16 8q5 4 0 8M18 4q9 8 0 16" />
          ) : (
            <path d="m17 9 5 6m0-6-5 6" />
          )}
        </svg>
        音 {soundEnabled ? 'ON' : 'OFF'}
        <small>（準備中）</small>
      </button>
    </footer>
  )
}
