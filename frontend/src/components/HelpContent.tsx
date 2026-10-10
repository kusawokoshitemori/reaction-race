import { useState } from 'react'

export default function HelpContent() {
  const [selected, setSelected] = useState(0)
  return (
    <div className="help-layout">
      <nav className="help-navigation" aria-label="遊び方の項目">
        {[0, 1, 2].map((index) => (
          <button
            key={index}
            type="button"
            className="secondary"
            aria-pressed={selected === index}
            aria-controls={`help-section-${selected}`}
            onClick={() => setSelected(index)}
          >
            hogehoge
          </button>
        ))}
      </nav>
      <section
        id={`help-section-${selected}`}
        className="help-copy"
        aria-label={`遊び方の項目 ${selected + 1}`}
      >
        <h2>hogehoge</h2>
        <p>hogehoge</p>
        <p>hogehoge</p>
        <p>hogehoge</p>
      </section>
    </div>
  )
}
