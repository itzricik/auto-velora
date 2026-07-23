import { Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { faqIds } from '../data'
import { translations, type Language } from '../i18n/translations'
import { SectionIntro } from './SectionIntro'

export function Faq({ language }: { language: Language }) {
  const copy = translations[language]
  const [openId, setOpenId] = useState<(typeof faqIds)[number] | null>('duration')
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let targetIndex: number | null = null
    if (event.key === 'ArrowDown') targetIndex = (index + 1) % faqIds.length
    if (event.key === 'ArrowUp') targetIndex = (index - 1 + faqIds.length) % faqIds.length
    if (event.key === 'Home') targetIndex = 0
    if (event.key === 'End') targetIndex = faqIds.length - 1
    if (targetIndex !== null) {
      event.preventDefault()
      buttonsRef.current[targetIndex]?.focus()
    }
  }

  return (
    <section className="section faq-section" id="faq">
      <div className="container faq-layout">
        <SectionIntro eyebrow={copy.faq.eyebrow} title={copy.faq.title} />
        <div className="faq-list" data-reveal>
          {faqIds.map((id, index) => {
            const isOpen = openId === id
            return (
              <article className={`faq-item ${isOpen ? 'is-open' : ''}`} key={id}>
                <h3>
                  <button
                    ref={(node) => { buttonsRef.current[index] = node }}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${id}`}
                    id={`faq-button-${id}`}
                    onClick={() => setOpenId(isOpen ? null : id)}
                    onKeyDown={(event) => onKeyDown(event, index)}
                  >
                    <span><small>0{index + 1}</small>{copy.faq.items[id].q}</span><Plus size={20} aria-hidden="true" />
                  </button>
                </h3>
                <div className="faq-item__panel" id={`faq-panel-${id}`} role="region" aria-labelledby={`faq-button-${id}`} hidden={!isOpen}>
                  <p>{copy.faq.items[id].a}</p>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
