import { GripVertical } from 'lucide-react'
import { useState } from 'react'
import { translations, type Language } from '../i18n/translations'
import { SectionIntro } from './SectionIntro'

export function BeforeAfter({ language }: { language: Language }) {
  const copy = translations[language]
  const [position, setPosition] = useState(52)

  return (
    <section className="section results" id="results">
      <div className="container">
        <SectionIntro eyebrow={copy.results.eyebrow} title={copy.results.title} body={copy.results.body} />
        <div className="comparison" style={{ '--comparison-position': `${position}%` } as React.CSSProperties} data-reveal>
          <picture className="comparison__image comparison__image--before">
            <source media="(max-width: 760px)" srcSet="/images/before-960.webp" />
            <img src="/images/before-1600.webp" width="1600" height="973" alt={copy.results.beforeAlt} loading="lazy" decoding="async" draggable="false" />
          </picture>
          <picture className="comparison__image comparison__image--after">
            <source media="(max-width: 760px)" srcSet="/images/after-960.webp" />
            <img src="/images/after-1600.webp" width="1600" height="973" alt={copy.results.afterAlt} loading="lazy" decoding="async" draggable="false" />
          </picture>
          <span className="comparison__label comparison__label--before">{copy.results.before}</span>
          <span className="comparison__label comparison__label--after">{copy.results.after}</span>
          <div className="comparison__divider" aria-hidden="true"><span><GripVertical size={20} /></span></div>
          <input
            className="comparison__range"
            type="range"
            min="0"
            max="100"
            value={position}
            aria-label={copy.results.slider}
            onChange={(event) => setPosition(Number(event.target.value))}
            onKeyDown={(event) => {
              let next: number | null = null
              if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, position - 1)
              if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(100, position + 1)
              if (event.key === 'Home') next = 0
              if (event.key === 'End') next = 100
              if (next !== null) {
                event.preventDefault()
                setPosition(next)
              }
            }}
          />
        </div>
      </div>
    </section>
  )
}
