import BackToTitle from './BackToTitle'

type AppHeaderProps = {
  signedIn: boolean
  showBack: boolean
  onBack: () => void
}

export default function AppHeader({
  signedIn,
  showBack,
  onBack,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      {showBack && <BackToTitle onBack={onBack} />}
      <div className="header-actions">
        <a href="#/auth">{signedIn ? 'デモプレイヤー' : 'ゲスト'}</a>
      </div>
    </header>
  )
}
