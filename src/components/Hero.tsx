import { ArrowDown, ArrowRight } from 'lucide-react'
import { translations, type Language } from '../i18n/translations'

export function Hero({ language }: { language: Language }) {
  const copy = translations[language].hero

  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <picture className="hero__media">
        <source media="(max-width: 760px)" srcSet="/images/hero-960.webp" />
        <img src="/images/hero-1600.webp" width="1600" height="854" alt="" fetchPriority="high" decoding="async" />
      </picture>
      <div className="hero__veil" aria-hidden="true" />
      <div className="hero__content container">
        <div className="hero__copy">
          <p className="eyebrow hero-entrance hero-entrance--1">{copy.eyebrow}</p>
          <h1 id="hero-title" className="hero-entrance hero-entrance--2">{copy.title}</h1>
          <p className="hero__body hero-entrance hero-entrance--3">{copy.body}</p>
          <div className="hero__actions hero-entrance hero-entrance--4">
            <a className="button button--copper" href="#estimator">{copy.primary}<ArrowRight size={18} aria-hidden="true" /></a>
            <a className="button button--ghost" href="#results">{copy.secondary}</a>
          </div>
        </div>
        <div className="hero__highlights hero-entrance hero-entrance--4" aria-label={copy.highlights.join(', ')}>
          {copy.highlights.map((item, index) => <span key={item}><b>0{index + 1}</b>{item}</span>)}
        </div>
      </div>
      <a href="#services" className="scroll-cue" aria-label={copy.scroll}>
        <span>{copy.scroll}</span><ArrowDown size={16} aria-hidden="true" />
      </a>
    </section>
  )
}
