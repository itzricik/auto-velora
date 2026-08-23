import { Armchair, Check, Layers3, RefreshCw, ScanLine, ShieldCheck, Sparkles } from 'lucide-react'
import { serviceCards, type ServiceId } from '../data'
import { translations, type Language } from '../i18n/translations'
import { SectionIntro } from './SectionIntro'
import { usePublicCatalog } from '../booking/CatalogContext'

const icons = {
  exterior: Sparkles,
  interior: Armchair,
  correction: ScanLine,
  ceramic: ShieldCheck,
  ppfFront: Layers3,
  ppfFull: Layers3,
  maintenance: RefreshCw,
}

type ServicesProps = {
  language: Language
  selected: ServiceId[]
  onToggle: (service: ServiceId) => void
}

function formatPrice(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
}

export function Services({ language, selected, onToggle }: ServicesProps) {
  const copy = translations[language]
  const { catalog } = usePublicCatalog()

  return (
    <section className="section services" id="services">
      <div className="container">
        <SectionIntro eyebrow={copy.servicesSection.eyebrow} title={copy.servicesSection.title} body={copy.servicesSection.body} />
        <div className="service-grid">
          {serviceCards.map((service, index) => {
            const live = catalog?.services.find((item) => item.code === service.id)
            const Icon = icons[service.id]
            const isSelected = selected.includes(service.id)
            return (
              <article className={`service-card service-card--${index + 1}`} key={service.id} data-reveal>
                <div className="service-card__top">
                  <span className="service-card__number">0{index + 1}</span>
                  <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
                </div>
                <h3>{copy.serviceNames[service.id]}</h3>
                <p>{copy.serviceDescriptions[service.id]}</p>
                <div className="service-card__meta">
                  <span><small>{copy.common.from}</small>{live ? formatPrice(live.base_price_cents / 100, copy.locale) : '—'}</span>
                  <span><small>{copy.servicesSection.duration}</small>{live ? `${Math.round((live.base_duration_minutes + live.buffer_minutes) / 60 * 10) / 10} h` : '—'}</span>
                </div>
                <button type="button" disabled={!live} className={`text-action ${isSelected ? 'is-selected' : ''}`} onClick={() => onToggle(service.id)}>
                  {isSelected ? <Check size={17} aria-hidden="true" /> : <span aria-hidden="true">＋</span>}
                  {isSelected ? copy.servicesSection.added : copy.servicesSection.add}
                </button>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
