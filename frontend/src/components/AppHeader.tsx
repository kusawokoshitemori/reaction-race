import BackToTitle from './BackToTitle'

type AppHeaderProps = {
  entered: boolean
  signedIn: boolean
  showBack: boolean
  backLabel?: string
  onAccount: () => void
  onBack: () => void
}

export default function AppHeader({
  entered,
  signedIn,
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
            href="#/auth"
            aria-label={
              signedIn
                ? 'デモプレイヤーのアカウント'
                : 'ゲスト：ログイン・アカウント'
            }
          >
            <span className="player-dot" aria-hidden="true" />
            {signedIn ? 'デモプレイヤー' : 'ゲスト'}
            <span className="account-link-label">
              {signedIn ? 'アカウント' : 'ログイン'}
            </span>
          </a>
        </div>
      )}
    </header>
  )
}
