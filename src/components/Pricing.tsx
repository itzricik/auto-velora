import { ArrowUpRight, Check } from 'lucide-react'
import { isServiceId, packages, type ServiceId } from '../pricing'
import { translations, type Language } from '../i18n/translations'
import { SectionIntro } from './SectionIntro'
import { usePublicCatalog } from '../booking/CatalogContext'

type PricingProps = {
  language: Language
  onChoose: (services: ServiceId[]) => void
}

export function Pricing({ language, onChoose }: PricingProps) {
  const copy = translations[language]
  const { catalog } = usePublicCatalog()
  const formatPrice = (value: number) => new Intl.NumberFormat(copy.locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

  return (
    <section className="section pricing-section" id="pricing">
      <div className="container">
        <SectionIntro eyebrow={copy.pricing.eyebrow} title={copy.pricing.title} body={copy.pricing.body} align="center" />
        <div className="pricing-grid">
          {packages.map((item) => {
            const live = catalog?.packages.find((entry) => entry.code === item.id)
            if (!live) return null
            const packageCopy = copy.pricing.packages[item.id]
            const includedServiceIds = live.service_ids
              .map((id) => catalog?.services.find((service) => service.id === id)?.code)
              .filter((id): id is ServiceId => Boolean(id && isServiceId(id)))
            return (
              <article key={item.id} className={`price-card ${item.featured ? 'price-card--featured' : ''}`} data-reveal>
                {item.featured && <span className="price-card__badge">{copy.pricing.popular}</span>}
                <p className="price-card__name">{packageCopy.name}</p>
                <h3><small>{copy.common.from}</small>{formatPrice(live.package_price_cents / 100)}</h3>
                <p className="price-card__description">{packageCopy.description}</p>
                <ul>{packageCopy.items.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>)}</ul>
                <button type="button" className={item.featured ? 'button button--copper button--full' : 'button button--outline button--full'} onClick={() => onChoose(includedServiceIds)}>
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
