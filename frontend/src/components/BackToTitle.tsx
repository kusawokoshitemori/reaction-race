type BackToTitleProps = {
  label?: string
  onBack: () => void
}

export default function BackToTitle({
  onBack,
  label = 'タイトルに戻る',
}: BackToTitleProps) {
  return (
    <button
      type="button"
      className="back-arrow"
      onClick={onBack}
      aria-label={label}
      title={label}
    >
      ←
    </button>
  )
}
