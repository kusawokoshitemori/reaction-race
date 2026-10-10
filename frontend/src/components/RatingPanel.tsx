type RatingPanelProps = {
  rating: number | null
  matches: number
}

export default function RatingPanel({ rating, matches }: RatingPanelProps) {
  return (
    <section className="rating-panel" aria-label="自分のレーティング">
      <h2>レーティング</h2>
      <div className={`rating-score${rating === null ? ' is-guest' : ''}`}>
        {rating === null ? 'レートなし' : rating.toLocaleString('ja-JP')}
      </div>
      <div className="rating-record">
        {rating === null ? 'ログインすると記録できます' : `${matches} 試合`}
      </div>
    </section>
  )
}
