import { ArrowUpRight, Check } from 'lucide-react'
import { packages, type ServiceId } from '../data'
import { translations, type Language } from '../i18n/translations'
import { SectionIntro } from './SectionIntro'

type PricingProps = {
  language: Language
  onChoose: (services: ServiceId[]) => void
}

const packageServices: Record<(typeof packages)[number]['id'], ServiceId[]> = {
  essential: ['exterior', 'maintenance'],
  restore: ['exterior', 'interior', 'correction'],
  protect: ['correction', 'ceramic'],
}

export function Pricing({ language, onChoose }: PricingProps) {
  const copy = translations[language]
  const formatPrice = (value: number) => new Intl.NumberFormat(copy.locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

  return (
    <section className="section pricing-section" id="pricing">
      <div className="container">
        <SectionIntro eyebrow={copy.pricing.eyebrow} title={copy.pricing.title} body={copy.pricing.body} align="center" />
        <div className="pricing-grid">
          {packages.map((item) => {
            const packageCopy = copy.pricing.packages[item.id]
            return (
              <article key={item.id} className={`price-card ${item.featured ? 'price-card--featured' : ''}`} data-reveal>
                {item.featured && <span className="price-card__badge">{copy.pricing.popular}</span>}
                <p className="price-card__name">{packageCopy.name}</p>
                <h3><small>{copy.common.from}</small>{formatPrice(item.price)}</h3>
                <p className="price-card__description">{packageCopy.description}</p>
                <ul>{packageCopy.items.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>)}</ul>
                <button type="button" className={item.featured ? 'button button--copper button--full' : 'button button--outline button--full'} onClick={() => onChoose(packageServices[item.id])}>
                  {copy.pricing.choose.replace('{name}', packageCopy.name)}<ArrowUpRight size={18} aria-hidden="true" />
                </button>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
