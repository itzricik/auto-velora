import { Check, LoaderCircle, Send } from 'lucide-react'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { packageDatabaseIds, serviceDatabaseIds, vehicleDatabaseIds } from '../booking/apiCatalog'
import { BookingApiError, createApiBooking, fetchAvailability } from '../booking/apiClient'
import { initialApiBookingState, reduceApiBookingState } from '../booking/apiState'
import { getLocalDate, normalizePhone } from '../booking/validation'
import { siteConfig } from '../config/site'
import { apiBookingCopy } from '../i18n/apiBooking'
import { translations, type Language } from '../i18n/translations'
import { calculateEstimate, calculatePackagePrice, packages, services, vehicleTypes, type PackageId, type ServiceId, type VehicleId } from '../pricing'
import { SectionIntro } from './SectionIntro'
import { TurnstileWidget } from './TurnstileWidget'

type ApiBookingProps = {
  language: Language
  estimatorSelections: ServiceId[]
  estimatorVehicle: VehicleId
}

type FormValues = {
  name: string
  phone: string
  email: string
  vehicleDescription: string
  notes: string
  consent: boolean
  company: string
}

const emptyForm: FormValues = {
  name: '',
  phone: '',
  email: '',
  vehicleDescription: '',
  notes: '',
  consent: false,
  company: '',
}

export function ApiBooking({ language, estimatorSelections, estimatorVehicle }: ApiBookingProps) {
  const copy = apiBookingCopy[language]
  const common = translations[language]
  const [vehicle, setVehicle] = useState<VehicleId>(estimatorVehicle)
  const [selectedServices, setSelectedServices] = useState<ServiceId[]>(estimatorSelections)
  const [selectedPackage, setSelectedPackage] = useState<PackageId | ''>('')
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState('')
  const [form, setForm] = useState<FormValues>(emptyForm)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormValues | 'services' | 'date' | 'slot', string>>>({})
  const [state, dispatch] = useReducer(reduceApiBookingState, initialApiBookingState)
  const [reloadKey, setReloadKey] = useState(0)
  const idempotencyKey = useRef('')
  const selectionReady = Boolean(date && (selectedPackage || selectedServices.length))

  useEffect(() => setVehicle(estimatorVehicle), [estimatorVehicle])
  useEffect(() => {
    if (estimatorSelections.length) {
      setSelectedPackage('')
      setSelectedServices(estimatorSelections)
    }
  }, [estimatorSelections])

  useEffect(() => {
    if (!selectionReady) {
      dispatch({ type: 'reset' })
      setSlot('')
      return
    }
    const controller = new AbortController()
    dispatch({ type: 'availability_loading' })
    setSlot('')
    fetchAvailability({
      date,
      vehicleCategoryId: vehicleDatabaseIds[vehicle],
      serviceIds: selectedPackage ? [] : selectedServices.map((id) => serviceDatabaseIds[id]),
      packageId: selectedPackage ? packageDatabaseIds[selectedPackage] : undefined,
      language,
    }, controller.signal)
      .then((result) => dispatch({
        type: 'availability_loaded',
        slots: result.slots,
        priceCents: result.serverEstimate.priceCents,
        durationMinutes: result.serverEstimate.durationMinutes,
      }))
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        dispatch({ type: 'error', code: error instanceof BookingApiError ? error.code : 'API_UNAVAILABLE' })
      })
    return () => controller.abort()
  }, [date, language, reloadKey, selectedPackage, selectedServices, selectionReady, vehicle])

  const clientEstimate = useMemo(() => {
    const serviceIds = selectedPackage
      ? [...(packages.find((item) => item.id === selectedPackage)?.serviceIds ?? [])]
      : selectedServices
    return calculateEstimate(serviceIds, vehicle)
  }, [selectedPackage, selectedServices, vehicle])
  const bookingPrice = selectedPackage
    ? calculatePackagePrice(selectedPackage, vehicle)
    : clientEstimate
  const clientPriceCents = bookingPrice.estimatedTotal * 100
  const serverDiffers = state.status === 'ready'
    && state.serverPriceCents !== clientPriceCents

  const toggleService = (service: ServiceId) => {
    setSelectedPackage('')
    setSelectedServices((current) => current.includes(service)
      ? current.filter((id) => id !== service)
      : [...current, service])
  }

  const selectPackage = (packageId: PackageId | '') => {
    setSelectedPackage(packageId)
    if (packageId) setSelectedServices([])
  }

  const updateForm = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const errors: typeof fieldErrors = {}
    if (!selectedPackage && !selectedServices.length) errors.services = copy.validation
    if (!date) errors.date = copy.validation
    if (!slot) errors.slot = copy.chooseSlot
    if (form.name.trim().length < 2) errors.name = copy.validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = copy.validation
    if (normalizePhone(form.phone).replace(/\D/g, '').length < 8) errors.phone = copy.validation
    if (form.vehicleDescription.trim().length < 2) errors.vehicleDescription = copy.validation
    if (!form.consent) errors.consent = copy.validation
    setFieldErrors(errors)
    if (Object.keys(errors).length) {
      dispatch({ type: 'error', code: 'VALIDATION_FAILED' })
      return
    }
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID()
    dispatch({ type: 'submitting' })
    try {
      const result = await createApiBooking({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: normalizePhone(form.phone),
        vehicleCategoryId: vehicleDatabaseIds[vehicle],
        vehicleDescription: form.vehicleDescription.trim(),
        serviceIds: selectedPackage ? [] : selectedServices.map((id) => serviceDatabaseIds[id]),
        packageId: selectedPackage ? packageDatabaseIds[selectedPackage] : undefined,
        requestedStart: slot,
        language,
        customerNotes: form.notes.trim() || undefined,
        consentAccepted: form.consent,
        consentPolicyVersion: siteConfig.consentPolicyVersion,
        idempotencyKey: idempotencyKey.current,
        company: form.company,
        turnstileToken: turnstileToken || undefined,
      })
      dispatch({ type: 'success', result })
      setForm(emptyForm)
      setFieldErrors({})
    } catch (error) {
      if (error instanceof BookingApiError && error.status === 409) {
        idempotencyKey.current = ''
        setSlot('')
        dispatch({ type: 'conflict' })
        setReloadKey((value) => value + 1)
        return
      }
      dispatch({ type: 'error', code: error instanceof BookingApiError ? error.code : 'API_UNAVAILABLE' })
    }
  }

  const errorMessage = state.status === 'error'
    ? state.code === 'RATE_LIMITED'
      ? copy.rateLimited
      : state.code === 'VALIDATION_FAILED'
        ? copy.validation
        : copy.unavailable
    : ''

  const formatPrice = (cents: number) => new Intl.NumberFormat(common.locale, {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)

  if (state.status === 'success') {
    return (
      <section className="section booking-section" id="booking">
        <div className="container api-booking-success" aria-live="polite">
          <span className="eyebrow">{copy.eyebrow}</span>
          <h2>{state.result.status === 'confirmed' ? copy.confirmed : copy.requested}</h2>
          <p>{state.result.message}</p>
          <dl className="demo-summary">
            <div><dt>{copy.reference}</dt><dd>{state.result.reference}</dd></div>
            <div><dt>{copy.serverEstimate}</dt><dd>{formatPrice(state.result.serverPriceCents)}</dd></div>
            <div><dt>{copy.duration}</dt><dd>{state.result.serverDurationMinutes / 60} {copy.hours}</dd></div>
          </dl>
          <a className="button button--copper" href="#services">{common.hero.secondary}</a>
        </div>
      </section>
    )
  }

  return (
    <section className="section booking-section" id="booking">
      <div className="container booking-layout">
        <div className="booking-intro">
          <SectionIntro eyebrow={copy.eyebrow} title={copy.title} body={copy.body} />
        </div>
        <form className="booking-form api-booking-form" onSubmit={submit} noValidate>
          <fieldset className="booking-vehicle-picker vehicle-picker">
            <legend>{copy.vehicle}</legend>
            <p>{copy.vehicleHelp}</p>
            <div className="vehicle-grid">
              {vehicleTypes.map((item) => (
                <label key={item.id} className={vehicle === item.id ? 'is-selected' : ''}>
                  <input
                    type="radio"
                    name="booking-vehicle-type"
                    value={item.id}
                    checked={vehicle === item.id}
                    onChange={() => setVehicle(item.id)}
                  />
                  <span className="vehicle-picker__check">{vehicle === item.id && <Check size={14} aria-hidden="true" />}</span>
                  <strong>{common.estimator.vehicles[item.id]}</strong>
                  <small>{common.estimator.vehicleExample[item.id]}</small>
                  <em>×{new Intl.NumberFormat(common.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.multiplier)}</em>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="booking-services">
            <legend>{copy.package}</legend>
            <div>
              <label className={!selectedPackage ? 'is-selected' : ''}>
                <input type="radio" name="package" checked={!selectedPackage} onChange={() => selectPackage('')} />
                <span>{!selectedPackage && <Check size={13} />}</span>{copy.custom}
              </label>
              {packages.map((item) => (
                <label key={item.id} className={selectedPackage === item.id ? 'is-selected' : ''}>
                  <input type="radio" name="package" checked={selectedPackage === item.id} onChange={() => selectPackage(item.id)} />
                  <span>{selectedPackage === item.id && <Check size={13} />}</span>{item.id}
                </label>
              ))}
            </div>
          </fieldset>
          {fieldErrors.services && <p className="field-error">{fieldErrors.services}</p>}

          {!selectedPackage && (
            <fieldset className="booking-services">
              <legend>{copy.services}</legend>
              <div>{services.map((service) => (
                <label key={service.id} className={selectedServices.includes(service.id) ? 'is-selected' : ''}>
                  <input type="checkbox" checked={selectedServices.includes(service.id)} onChange={() => toggleService(service.id)} />
                  <span>{selectedServices.includes(service.id) && <Check size={13} />}</span>{common.serviceNames[service.id]}
                </label>
              ))}</div>
            </fieldset>
          )}

          {(selectedPackage || selectedServices.length > 0) && (
            <div className="booking-estimate booking-estimate--live" aria-live="polite">
              <div><span>{common.estimator.subtotal}</span><strong>{formatPrice(bookingPrice.baseTotal * 100)}</strong></div>
              <div><span>{common.estimator.sizeAdjustment}</span><strong>× {new Intl.NumberFormat(common.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bookingPrice.multiplier)}</strong></div>
              <div className="booking-estimate__total"><span>{common.estimator.estimatedTotal}</span><strong>{formatPrice(state.status === 'ready' ? state.serverPriceCents : clientPriceCents)}</strong></div>
              {serverDiffers && <small>{copy.authoritative}</small>}
              <small>{common.estimator.disclaimer}</small>
            </div>
          )}

          <div className="field">
            <label htmlFor="api-date">{copy.date}</label>
            <input id="api-date" type="date" min={getLocalDate()} value={date} onChange={(event) => { setDate(event.target.value); setFieldErrors((current) => ({ ...current, date: undefined })) }} aria-invalid={Boolean(fieldErrors.date)} aria-describedby={fieldErrors.date ? 'api-date-error' : undefined} />
            {fieldErrors.date && <span id="api-date-error" className="field-error">{fieldErrors.date}</span>}
          </div>

          <fieldset className="api-slots">
            <legend>{copy.slots}</legend>
            {state.status === 'availability_loading' && <p><LoaderCircle className="spin" size={18} /> {copy.loading}</p>}
            {state.status === 'no_availability' && <p>{copy.none}</p>}
            {state.status === 'conflict' && <p className="field-error">{copy.conflict}</p>}
            {(state.status === 'ready' || state.status === 'submitting' || state.status === 'error') && state.slots.length > 0 && (
              <div>{state.slots.map((available) => (
                <button type="button" key={available.start} className={slot === available.start ? 'is-selected' : ''} onClick={() => setSlot(available.start)}>
                  {available.displayTime}
                </button>
              ))}</div>
            )}
            {fieldErrors.slot && <p className="field-error">{fieldErrors.slot}</p>}
          </fieldset>

          {state.status === 'ready' && (
            <div className="booking-estimate">
              <div><span>{copy.duration}</span><strong>{state.serverDurationMinutes / 60} {copy.hours}</strong></div>
            </div>
          )}

          <h3 className="api-booking-form__heading">{copy.details}</h3>
          <div className="form-grid">
            <div className="field"><label htmlFor="api-name">{copy.name}</label><input id="api-name" autoComplete="name" value={form.name} onChange={(event) => updateForm('name', event.target.value)} maxLength={100} required aria-invalid={Boolean(fieldErrors.name)} />{fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}</div>
            <div className="field"><label htmlFor="api-phone">{copy.phone}</label><input id="api-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} maxLength={32} required aria-invalid={Boolean(fieldErrors.phone)} />{fieldErrors.phone && <span className="field-error">{fieldErrors.phone}</span>}</div>
            <div className="field"><label htmlFor="api-email">{copy.email}</label><input id="api-email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} maxLength={254} required aria-invalid={Boolean(fieldErrors.email)} />{fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}</div>
            <div className="field"><label htmlFor="api-car">{copy.vehicleDescription}</label><input id="api-car" value={form.vehicleDescription} onChange={(event) => updateForm('vehicleDescription', event.target.value)} maxLength={120} required aria-invalid={Boolean(fieldErrors.vehicleDescription)} />{fieldErrors.vehicleDescription && <span className="field-error">{fieldErrors.vehicleDescription}</span>}</div>
          </div>
          <div className="field"><label htmlFor="api-notes">{copy.notes}</label><textarea id="api-notes" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} maxLength={1500} /></div>
          <div className="field api-honeypot" aria-hidden="true"><label htmlFor="api-company">{copy.honeypot}</label><input id="api-company" tabIndex={-1} autoComplete="off" value={form.company} onChange={(event) => updateForm('company', event.target.value)} /></div>
          <label className="consent-field"><input type="checkbox" checked={form.consent} onChange={(event) => updateForm('consent', event.target.checked)} /><span className="checkbox-ui">{form.consent && <Check size={15} />}</span><span>{copy.consent}</span></label>
          {fieldErrors.consent && <p className="field-error">{fieldErrors.consent}</p>}
          <TurnstileWidget onTokenChange={setTurnstileToken} />
          {errorMessage && <p className="field-error" role="alert">{errorMessage}</p>}
          <button className="button button--copper button--full booking-submit" type="submit" disabled={state.status === 'submitting' || !slot}>
            {state.status === 'submitting' ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}
            {state.status === 'submitting' ? copy.submitting : slot ? copy.submit : copy.chooseSlot}
          </button>
        </form>
      </div>
    </section>
  )
}
