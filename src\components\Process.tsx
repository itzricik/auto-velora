import { processSteps } from '../data'
import { translations, type Language } from '../i18n/translations'
import { SectionIntro } from './SectionIntro'

export function Process({ language }: { language: Language }) {
  const copy = translations[language]

  return (
    <section className="section process-section" id="process">
      <div className="container process-layout">
        <div className="process-intro">
          <SectionIntro eyebrow={copy.process.eyebrow} title={copy.process.title} body={copy.process.body} />
          <div className="process-light" aria-hidden="true" />
        </div>
        <ol className="process-list">
          {processSteps.map((step, index) => (
            <li key={step} data-reveal>
              <span className="process-list__number">0{index + 1}</span>
              <div><h3>{copy.process.steps[step].title}</h3><p>{copy.process.steps[step].body}</p></div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
