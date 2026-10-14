import BackToTitle from './BackToTitle'

type AppHeaderProps = {
  entered: boolean
  signedIn: boolean
  displayName?: string
  accountOpen: boolean
  showBack: boolean
  backLabel?: string
  onAccount: () => void
  onBack: () => void
}

export default function AppHeader({
  entered,
  signedIn,
  displayName = 'プレイヤー',
  accountOpen,
  showBack,
  onBack,
  backLabel,
  onAccount,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="header-leading">
        {showBack && <BackToTitle onBack={onBack} label={backLabel} />}
      </div>
      {entered && (
        <div className="header-actions">
          <a
            className="account-link"
            onClick={onAccount}
            href={accountOpen ? '#/' : '#/auth'}
            aria-expanded={accountOpen}
            aria-label={
              signedIn
                ? `${displayName}のアカウント`
                : 'ゲスト：ログイン・アカウント'
            }
          >
            <span className="player-dot" aria-hidden="true" />
            {signedIn ? displayName : 'ゲスト'}
            <span className="account-link-label">
              {signedIn ? 'アカウント' : 'ログイン'}
            </span>
          </a>
        </div>
      )}
    </header>
  )
}
