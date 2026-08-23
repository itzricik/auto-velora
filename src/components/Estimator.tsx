import { ArrowRight, Check, Clock3, X } from 'lucide-react'
import { calculateEstimate, services, vehicleTypes, type ServiceId, type VehicleId } from '../pricing'
import { translations, type Language } from '../i18n/translations'
import { SectionIntro } from './SectionIntro'
import { usePublicCatalog } from '../booking/CatalogContext'

type EstimatorProps = {
  language: Language
  selected: ServiceId[]
  vehicle: VehicleId
  onVehicleChange: (vehicle: VehicleId) => void
  onToggle: (service: ServiceId) => void
  onContinue: () => void
}

export function Estimator({ language, selected, vehicle, onVehicleChange, onToggle, onContinue }: EstimatorProps) {
  const copy = translations[language]
  const { catalog, status, retry } = usePublicCatalog()
  const selectedItems = services.filter((service) => selected.includes(service.id) && catalog?.services.some((item) => item.code === service.id))
  const estimate = calculateEstimate(selected, vehicle, catalog)
  const { multiplier, baseTotal, estimatedTotal: total, estimatedHours: hours } = estimate
  const formatPrice = (value: number) => new Intl.NumberFormat(copy.locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
  const formatMultiplier = new Intl.NumberFormat(copy.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(multiplier)
  const timeLabel = hours > 12
    ? copy.estimator.days.replace('{days}', new Intl.NumberFormat(copy.locale, { maximumFractionDigits: 1 }).format(hours / 8))
    : copy.estimator.hours.replace('{hours}', new Intl.NumberFormat(copy.locale, { maximumFractionDigits: 1 }).format(hours))

  return (
    <section className="section estimator-section" id="estimator">
      <div className="container">
        <SectionIntro eyebrow={copy.estimator.eyebrow} title={copy.estimator.title} body={copy.estimator.body} />
        <div className="estimator" data-reveal>
          <div className="estimator__builder">
            <fieldset className="vehicle-picker">
              <legend>{copy.estimator.vehicleTitle}</legend>
              <div className="vehicle-grid">
                {vehicleTypes.filter((item) => catalog?.vehicleCategories.some((vehicleType) => vehicleType.code === item.id)).map((item) => {
                  const live = catalog?.vehicleCategories.find((vehicleType) => vehicleType.code === item.id)
                  return (
                  <label key={item.id} className={vehicle === item.id ? 'is-selected' : ''}>
                    <input type="radio" name="vehicle-type" value={item.id} checked={vehicle === item.id} onChange={() => onVehicleChange(item.id)} />
                    <span className="vehicle-picker__check">{vehicle === item.id && <Check size={14} aria-hidden="true" />}</span>
                    <strong>{copy.estimator.vehicles[item.id]}</strong>
                    <small>{copy.estimator.vehicleExample[item.id]}</small>
                    <em>×{new Intl.NumberFormat(copy.locale, { minimumFractionDigits: 2 }).format(Number(live?.price_multiplier ?? 0))}</em>
                  </label>
                )})}
              </div>
            </fieldset>

            <fieldset className="service-picker">
              <legend>{copy.estimator.servicesTitle}</legend>
              <div className="service-picker__list">
                {services.filter((service) => catalog?.services.some((item) => item.code === service.id)).map((service) => {
                  const live = catalog?.services.find((item) => item.code === service.id)
                  const isSelected = selected.includes(service.id)
                  return (
                    <label key={service.id} className={isSelected ? 'is-selected' : ''}>
                      <input type="checkbox" checked={isSelected} onChange={() => onToggle(service.id)} />
                      <span className="checkbox-ui">{isSelected && <Check size={15} aria-hidden="true" />}</span>
                      <span><strong>{copy.serviceNames[service.id]}</strong><small>{copy.estimator.base} {formatPrice((live?.base_price_cents ?? 0) / 100)}</small></span>
                      <span className="service-picker__price">{formatPrice(Math.round((live?.base_price_cents ?? 0) * multiplier) / 100)}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          </div>

          <aside className="estimate-summary" aria-live="polite">
            <p className="estimate-summary__label">{copy.estimator.summaryTitle}</p>
            {selectedItems.length === 0 ? (
              <p className="estimate-summary__empty">{copy.estimator.empty}</p>
            ) : (
              <ul className="estimate-lines">
                {selectedItems.map((service) => {
                  const live = catalog?.services.find((item) => item.code === service.id)
                  return (
                  <li key={service.id}>
                    <span>{copy.serviceNames[service.id]}<small>{formatPrice((live?.base_price_cents ?? 0) / 100)} × {formatMultiplier}</small></span>
                    <strong>{formatPrice(Math.round((live?.base_price_cents ?? 0) * multiplier) / 100)}</strong>
                    <button type="button" onClick={() => onToggle(service.id)} aria-label={`${copy.estimator.remove}: ${copy.serviceNames[service.id]}`}><X size={15} aria-hidden="true" /></button>
                  </li>
                )})}
              </ul>
            )}
            <div className="estimate-calculation">
              <div><span>{copy.estimator.subtotal}</span><strong>{formatPrice(baseTotal)}</strong></div>
              <div><span>{copy.estimator.sizeAdjustment}</span><strong>× {formatMultiplier}</strong></div>
              <p>{copy.estimator.formula.replace('{multiplier}', formatMultiplier)}</p>
            </div>
            <div className="estimate-total">
              <span>{copy.estimator.estimatedTotal}</span>
              <strong>{formatPrice(total)}</strong>
            </div>
            <div className="estimate-time"><Clock3 size={18} aria-hidden="true" /><span>{copy.estimator.workingTime}<strong>{selected.length ? timeLabel : '—'}</strong></span></div>
            <p className="estimate-disclaimer">{copy.estimator.disclaimer}</p>
            {status === 'error' && <button className="button button--outline button--full" type="button" onClick={retry}>{copy.estimator.empty}</button>}
            <button className="button button--copper button--full" type="button" onClick={onContinue} disabled={!selected.length || status !== 'ready'}>
              {copy.estimator.continue}<ArrowRight size={18} aria-hidden="true" />
            </button>
          </aside>
        </div>
      </div>
    </section>
  )
}
