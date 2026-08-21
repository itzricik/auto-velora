import { Check, LoaderCircle, Send } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { packageDatabaseIds, serviceDatabaseIds, vehicleDatabaseIds } from '../booking/apiCatalog'
import { BookingApiError, createApiReservation, fetchAvailability } from '../booking/apiClient'
import { getLocalDate, normalizePhone } from '../booking/validation'
import { siteConfig } from '../config/site'
import { apiBookingCopy } from '../i18n/apiBooking'
import { translations, type Language } from '../i18n/translations'
import { calculateEstimate, calculatePackagePrice, packages, services, vehicleTypes, type PackageId, type ServiceId, type VehicleId } from '../pricing'
import type { AvailabilitySlot, PublicReservationResult } from '../shared/contracts'
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
  const [choiceMode, setChoiceMode] = useState<'nearest' | 'another'>('nearest')
  const [nearest, setNearest] = useState<AvailabilitySlot | null>(null)
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [selectedStart, setSelectedStart] = useState('')
  const [serverDurationMinutes, setServerDurationMinutes] = useState(0)
  const [serverPriceCents, setServerPriceCents] = useState(0)
  const [overnightAcknowledged, setOvernightAcknowledged] = useState(false)
  const [availabilityStatus, setAvailabilityStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [availabilityRevision, setAvailabilityRevision] = useState(0)
  const [form, setForm] = useState<FormValues>(emptyForm)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormValues | 'services' | 'date' | 'slot' | 'overnight', string>>>({})
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorCode, setErrorCode] = useState('')
  const [result, setResult] = useState<PublicReservationResult | null>(null)
  const idempotencyKey = useRef('')

  useEffect(() => setVehicle(estimatorVehicle), [estimatorVehicle])
  useEffect(() => {
    if (estimatorSelections.length) {
      setSelectedPackage('')
      setSelectedServices(estimatorSelections)
    }
  }, [estimatorSelections])

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
  const availabilityServiceIds = useMemo(() => selectedPackage
    ? []
    : selectedServices.map((id) => serviceDatabaseIds[id]), [selectedPackage, selectedServices])

  useEffect(() => {
    setSelectedStart('')
    setOvernightAcknowledged(false)
    setSlots([])
    setNearest(null)
    setServerDurationMinutes(0)
    setServerPriceCents(0)
    if (!selectedPackage && !selectedServices.length) {
      setAvailabilityStatus('idle')
      return
    }
    const controller = new AbortController()
    setAvailabilityStatus('loading')
    const timeout = window.setTimeout(() => {
      fetchAvailability({
        date,
        vehicleCategoryId: vehicleDatabaseIds[vehicle],
        serviceIds: availabilityServiceIds,
        packageId: selectedPackage ? packageDatabaseIds[selectedPackage] : undefined,
        language,
      }, controller.signal).then((response) => {
        setSlots(response.slots)
        setNearest(response.nearest)
        setServerDurationMinutes(response.serverEstimate.durationMinutes)
        setServerPriceCents(response.serverEstimate.priceCents)
        setAvailabilityStatus('ready')
      }).catch((error) => {
        if ((error as Error).name !== 'AbortError') setAvailabilityStatus('error')
      })
    }, 180)
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [availabilityRevision, availabilityServiceIds, date, language, selectedPackage, selectedServices.length, vehicle])

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
    if (!selectedStart) errors.slot = copy.chooseSlot
    if (form.name.trim().length < 2) errors.name = copy.validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = copy.validation
    if (normalizePhone(form.phone).replace(/\D/g, '').length < 8) errors.phone = copy.validation
    if (form.vehicleDescription.trim().length < 2) errors.vehicleDescription = copy.validation
    if (!form.consent) errors.consent = copy.validation
    const selectedPlan = selectedStart === nearest?.start
      ? nearest
      : slots.find((slot) => slot.start === selectedStart) ?? null
    if (selectedPlan?.continuesNextWorkingDay && !overnightAcknowledged) errors.overnight = copy.overnightRequired
    setFieldErrors(errors)
    if (Object.keys(errors).length) {
      setErrorCode('VALIDATION_FAILED')
      setStatus('error')
      return
    }
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID()
    setStatus('submitting')
    setErrorCode('')
    try {
      const response = await createApiReservation({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: normalizePhone(form.phone),
        vehicleCategoryId: vehicleDatabaseIds[vehicle],
        vehicleDescription: form.vehicleDescription.trim(),
        serviceIds: selectedPackage ? [] : selectedServices.map((id) => serviceDatabaseIds[id]),
        packageId: selectedPackage ? packageDatabaseIds[selectedPackage] : undefined,
        requestedStart: selectedStart,
        language,
        customerNotes: form.notes.trim() || undefined,
        consentAccepted: form.consent,
        consentPolicyVersion: siteConfig.consentPolicyVersion,
        idempotencyKey: idempotencyKey.current,
        company: form.company,
        turnstileToken: turnstileToken || undefined,
        overnightAcknowledged,
      })
      setResult(response)
      setStatus('success')
      setForm(emptyForm)
      setOvernightAcknowledged(false)
      setFieldErrors({})
    } catch (error) {
      const code = error instanceof BookingApiError ? error.code : 'API_UNAVAILABLE'
      setErrorCode(code)
      if (code === 'SCHEDULING_CONFLICT') {
        setSelectedStart('')
        setAvailabilityRevision((current) => current + 1)
      }
      setStatus('error')
    }
  }

  const errorMessage = status === 'error'
    ? errorCode === 'SCHEDULING_CONFLICT'
      ? copy.conflict
      : errorCode === 'OVERNIGHT_ACK_REQUIRED'
        ? copy.overnightRequired
      : errorCode === 'RATE_LIMITED'
      ? copy.rateLimited
      : errorCode === 'VALIDATION_FAILED'
        ? copy.validation
        : copy.unavailable
    : ''

  const formatPrice = (cents: number) => new Intl.NumberFormat(common.locale, {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
  const formatDateTime = (value: string) => new Intl.DateTimeFormat(common.locale, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Riga',
  }).format(new Date(value))
  const selectedPlan = selectedStart === nearest?.start
    ? nearest
    : slots.find((slot) => slot.start === selectedStart) ?? null

  if (status === 'success' && result) {
    return (
      <section className="section booking-section" id="booking">
        <div className="container api-booking-success" aria-live="polite">
          <span className="eyebrow">{copy.eyebrow}</span>
          <h2>{copy.requested}</h2>
          <p>{result.message}</p>
          <dl className="demo-summary">
            <div><dt>{copy.reference}</dt><dd>{result.reference}</dd></div>
            <div><dt>{copy.serverEstimate}</dt><dd>{formatPrice(result.serverPriceCents)}</dd></div>
            <div><dt>{copy.date}</dt><dd>{new Intl.DateTimeFormat(common.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Riga' }).format(new Date(result.start))}</dd></div>
            <div><dt>{copy.duration}</dt><dd>{result.serverDurationMinutes % 60 === 0 ? `${result.serverDurationMinutes / 60} ${copy.hours}` : `${result.serverDurationMinutes} ${copy.minutes}`}</dd></div>
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
              <div className="booking-estimate__total"><span>{common.estimator.estimatedTotal}</span><strong>{formatPrice(serverPriceCents || clientPriceCents)}</strong></div>
              {serverDurationMinutes > 0 && <div><span>{copy.duration}</span><strong>{serverDurationMinutes} {copy.minutes}</strong></div>}
              <small>{common.estimator.disclaimer}</small>
            </div>
          )}

          {(selectedPackage || selectedServices.length > 0) && <section className="booking-availability" aria-live="polite">
            <h3>{copy.nearestTitle}</h3>
            {availabilityStatus === 'loading' && <p><LoaderCircle className="spin" size={17} /> {copy.loading}</p>}
            {availabilityStatus === 'error' && <p className="field-error" role="alert">{copy.unavailable}</p>}
            {availabilityStatus === 'ready' && !nearest && <p>{copy.noneNearest}</p>}
            {nearest && <dl className="availability-summary">
              <div><dt>{copy.start}</dt><dd>{formatDateTime(nearest.start)}</dd></div>
              <div><dt>{copy.completion}</dt><dd>{formatDateTime(nearest.end)}</dd></div>
            </dl>}
            <div className="availability-actions">
              <button type="button" className="button button--copper" disabled={!nearest} onClick={() => { setChoiceMode('nearest'); setSelectedStart(nearest?.start ?? ''); setOvernightAcknowledged(false); setFieldErrors((current) => ({ ...current, slot: undefined })) }}>{copy.chooseNearest}</button>
              <button type="button" className="button button--outline" onClick={() => { setChoiceMode('another'); setSelectedStart(''); setOvernightAcknowledged(false) }}>{copy.chooseAnother}</button>
            </div>
          </section>}

          {choiceMode === 'another' && <div className="field">
            <label htmlFor="api-date">{copy.date}</label>
            <input id="api-date" type="date" min={getLocalDate()} value={date} onChange={(event) => { setDate(event.target.value); setSelectedStart(''); setOvernightAcknowledged(false); setFieldErrors((current) => ({ ...current, date: undefined })) }} aria-invalid={Boolean(fieldErrors.date)} aria-describedby={fieldErrors.date ? 'api-date-error' : undefined} />
            {fieldErrors.date && <span id="api-date-error" className="field-error">{fieldErrors.date}</span>}
          </div>}

          {choiceMode === 'another' && date && (selectedPackage || selectedServices.length > 0) && (
            <fieldset className="booking-services booking-time-picker">
              <legend>{copy.slots}</legend>
              {availabilityStatus === 'loading' && <p aria-live="polite"><LoaderCircle className="spin" size={17} /> {copy.loading}</p>}
              {availabilityStatus === 'error' && <p className="field-error" role="alert">{copy.unavailable}</p>}
              {availabilityStatus === 'ready' && !slots.length && <p>{copy.none}</p>}
              {slots.length > 0 && <div>{slots.map((slot) => (
                <label key={slot.start} className={selectedStart === slot.start ? 'is-selected' : ''}>
                  <input type="radio" name="reservation-time" checked={selectedStart === slot.start} onChange={() => { setSelectedStart(slot.start); setOvernightAcknowledged(false); setFieldErrors((current) => ({ ...current, slot: undefined })) }} />
                  <span>{selectedStart === slot.start && <Check size={13} />}</span>
                  {slot.displayTime}<small>{copy.completes} {formatDateTime(slot.end)}</small>
                </label>
              ))}</div>}
              {fieldErrors.slot && <p className="field-error">{fieldErrors.slot}</p>}
            </fieldset>
          )}

          {selectedPlan && <div className="selected-plan" aria-live="polite">
            <strong>{copy.selectedPlan}</strong>
            <span>{formatDateTime(selectedPlan.start)} → {formatDateTime(selectedPlan.end)}</span>
          </div>}

          {selectedPlan?.continuesNextWorkingDay && <div className="overnight-notice">
            <p>{copy.overnightNotice}</p>
            <label className="consent-field"><input type="checkbox" checked={overnightAcknowledged} onChange={(event) => { setOvernightAcknowledged(event.target.checked); setFieldErrors((current) => ({ ...current, overnight: undefined })) }} /><span className="checkbox-ui">{overnightAcknowledged && <Check size={15} />}</span><span>{copy.overnightConsent}</span></label>
            {fieldErrors.overnight && <p className="field-error">{fieldErrors.overnight}</p>}
          </div>}

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
          {errorMessage && <div role="alert"><p className="field-error">{errorMessage}</p><button type="button" className="button button--outline" onClick={() => { setAvailabilityRevision((current) => current + 1); setStatus('idle') }}>{copy.retry}</button></div>}
          <button className="button button--copper button--full booking-submit" type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}
            {status === 'submitting' ? copy.submitting : copy.submit}
          </button>
        </form>
      </div>
    </section>
  )
}
