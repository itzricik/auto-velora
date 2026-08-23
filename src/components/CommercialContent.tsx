import { ArrowRight, ExternalLink, Star } from 'lucide-react'
import { usePublicCatalog } from '../booking/CatalogContext'
import type { Language } from '../i18n/translations'
import type { PublicCaseStudy, PublicService } from '../shared/publicCatalog'
import { SectionIntro } from './SectionIntro'

const copy = {
  en: { eyebrow: 'Compare services', title: 'Choose the right level of care.', body: 'Prices and working times come from the same live catalog used for availability and booking.', service: 'Service', best: 'Best for', included: 'Included work', recommended: 'Recommended condition', duration: 'Working time', price: 'Starting price', protection: 'Protection', booking: 'Book this service', confirm: 'Business details to be confirmed', cases: 'Case studies', reviews: 'Verified reviews', initial: 'Initial condition', work: 'Work performed' },
  lv: { eyebrow: 'Pakalpojumu salīdzinājums', title: 'Izvēlieties atbilstošu kopšanas līmeni.', body: 'Cenas un darba laiki nāk no tā paša aktuālā kataloga, ko izmanto pieejamības un rezervācijas aprēķinam.', service: 'Pakalpojums', best: 'Piemērots', included: 'Iekļautie darbi', recommended: 'Ieteicamais stāvoklis', duration: 'Darba laiks', price: 'Sākot no', protection: 'Aizsardzība', booking: 'Rezervēt pakalpojumu', confirm: 'Informācija jāapstiprina uzņēmumam', cases: 'Darbu piemēri', reviews: 'Pārbaudītas atsauksmes', initial: 'Sākotnējais stāvoklis', work: 'Veiktie darbi' },
  ru: { eyebrow: 'Сравнение услуг', title: 'Выберите подходящий уровень ухода.', body: 'Цены и рабочее время берутся из того же актуального каталога, который используется для доступности и записи.', service: 'Услуга', best: 'Подходит для', included: 'Входит в услугу', recommended: 'Рекомендуемое состояние', duration: 'Рабочее время', price: 'От', protection: 'Защита', booking: 'Записаться на услугу', confirm: 'Данные требуют подтверждения компанией', cases: 'Примеры работ', reviews: 'Проверенные отзывы', initial: 'Исходное состояние', work: 'Выполненные работы' },
} as const

const suffix = (language: Language) => language === 'lv' ? 'lv' : language === 'ru' ? 'ru' : 'en'

function field(service: PublicService, name: 'name' | 'description' | 'best_for' | 'protection_duration' | 'recommended_condition', language: Language): string | null {
  return service[`${name}_${suffix(language)}`]
}

function includedWork(service: PublicService, language: Language): string[] {
  return service[`included_work_${suffix(language)}`]
}

function caseText(study: PublicCaseStudy, name: 'title' | 'initial_condition' | 'work_performed', language: Language): string {
  return study[`${name}_${suffix(language)}`]
}

function duration(minutes: number, language: Language): string {
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} ${language === 'lv' ? 'st.' : language === 'ru' ? 'ч.' : 'h'}`
}

export function CommercialContent({ language }: { language: Language }) {
  const { catalog } = usePublicCatalog()
  if (!catalog?.services.length) return null
  const text = copy[language]
  const locale = language === 'lv' ? 'lv-LV' : language === 'ru' ? 'ru-LV' : 'en-LV'
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
  const reviews = catalog.reviews.filter((review) => review.language === language)

  return <>
    <section className="section service-comparison" id="comparison">
      <div className="container">
        <SectionIntro eyebrow={text.eyebrow} title={text.title} body={text.body} />
        <div className="service-comparison__table" role="region" aria-label={text.eyebrow} tabIndex={0}>
          <table><thead><tr><th>{text.service}</th><th>{text.best}</th><th>{text.duration}</th><th>{text.price}</th><th>{text.protection}</th><th /></tr></thead>
            <tbody>{catalog.services.map((service) => <tr key={service.id}>
              <th scope="row"><strong>{field(service, 'name', language)}</strong><small>{field(service, 'description', language)}</small>{includedWork(service, language).length > 0 && <div className="service-inclusions"><b>{text.included}</b><ul>{includedWork(service, language).map((item) => <li key={item}>{item}</li>)}</ul></div>}</th>
              <td>{field(service, 'best_for', language) || field(service, 'description', language)}{field(service, 'recommended_condition', language) && <small><b>{text.recommended}:</b> {field(service, 'recommended_condition', language)}</small>}</td>
              <td>{duration(service.base_duration_minutes + service.buffer_minutes, language)}</td>
              <td>{money(service.base_price_cents)}</td>
              <td>{field(service, 'protection_duration', language) || <small>{text.confirm}</small>}</td>
              <td><a href="#booking" aria-label={`${text.booking}: ${field(service, 'name', language)}`}><ArrowRight size={17} /></a></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="service-comparison__cards">{catalog.services.map((service) => <article key={service.id}>
          <h3>{field(service, 'name', language)}</h3><p>{field(service, 'best_for', language) || field(service, 'description', language)}</p>
          {includedWork(service, language).length > 0 && <div className="service-inclusions"><b>{text.included}</b><ul>{includedWork(service, language).map((item) => <li key={item}>{item}</li>)}</ul></div>}
          <dl><div><dt>{text.duration}</dt><dd>{duration(service.base_duration_minutes + service.buffer_minutes, language)}</dd></div><div><dt>{text.price}</dt><dd>{money(service.base_price_cents)}</dd></div><div><dt>{text.protection}</dt><dd>{field(service, 'protection_duration', language) || text.confirm}</dd></div><div><dt>{text.recommended}</dt><dd>{field(service, 'recommended_condition', language) || text.confirm}</dd></div></dl>
          <a href="#booking">{text.booking}<ArrowRight size={16} /></a>
        </article>)}</div>
      </div>
    </section>
    {catalog.caseStudies.length > 0 && <section className="section public-case-studies"><div className="container"><h2>{text.cases}</h2><div>{catalog.caseStudies.map((study) => <article key={study.id}>
      <h3>{caseText(study, 'title', language)}</h3><p>{study.vehicle}</p>
      <div className="case-study-copy"><p><strong>{text.initial}</strong>{caseText(study, 'initial_condition', language)}</p><p><strong>{text.work}</strong>{caseText(study, 'work_performed', language)}</p></div>
      {(study.service_duration_minutes || study.price_cents) && <p className="case-study-meta">{study.service_duration_minutes ? duration(study.service_duration_minutes, language) : ''}{study.service_duration_minutes && study.price_cents ? ' · ' : ''}{study.price_cents ? money(study.price_cents) : ''}</p>}
      {study.media.length > 0 && <div className="case-study-media">{study.media.map((item) => <figure key={item.id}><img loading="lazy" width="640" height="480" src={item.public_url} alt={item[`alt_${suffix(language)}`]} /><figcaption>{item.media_type}</figcaption></figure>)}</div>}
    </article>)}</div></div></section>}
    {reviews.length > 0 && <section className="section public-reviews"><div className="container"><h2>{text.reviews}</h2><div>{reviews.map((review) => <article key={review.id}><div aria-label={`${review.rating} / 5`}>{Array.from({ length: review.rating }, (_, index) => <Star key={index} size={15} fill="currentColor" />)}</div><blockquote>{review.review_text}</blockquote><p>{review.customer_display_name} · <a href={review.source_url} target="_blank" rel="noopener noreferrer">{review.source_name}<ExternalLink size={13} /></a></p></article>)}</div></div></section>}
  </>
}
