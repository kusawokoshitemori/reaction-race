import BackToTitle from './BackToTitle'

type AppHeaderProps = {
  signedIn: boolean
  showBack: boolean
  backLabel?: string
  onAccount: () => void
  onBack: () => void
}

export default function AppHeader({
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
        </a>
      </div>
    </header>
  )
}
