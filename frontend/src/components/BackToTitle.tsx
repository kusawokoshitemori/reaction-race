type BackToTitleProps = {
  onBack: () => void
}

export default function BackToTitle({ onBack }: BackToTitleProps) {
  return (
    <button
      type="button"
      className="back-arrow"
      onClick={onBack}
      aria-label="タイトルに戻る"
      title="タイトルに戻る"
    >
      ←
    </button>
  )
}
