import { Check, LoaderCircle, Send, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildGoogleFormsPayload } from '../booking/payload'
import { generateRequestReference } from '../booking/reference'
import {
  BOOKING_LIMITS,
  buildSubmissionFingerprint,
  getLocalDate,
  isDuplicateSubmission,
  sanitizeBookingValues,
  validateBooking,
  type BookingField,
  type BookingFormValues,
} from '../booking/validation'
import { siteConfig } from '../config/site'
import { translations, type Language } from '../i18n/translations'
import { calculateEstimate, services, type ServiceId, type VehicleId } from '../pricing'
import { SectionIntro } from './SectionIntro'

type BookingProps = {
  language: Language
  estimatorSelections: ServiceId[]
  estimatorVehicle: VehicleId
}

type FormValues = Omit<BookingFormValues, 'serviceIds'> & { serviceIds: ServiceId[] }
type SubmitStatus = 'idle' | 'loading' | 'attempted' | 'error'

const emptyValues: FormValues = {
  name: '',
  phone: '',
  email: '',
  vehicle: '',
  serviceIds: [],
  date: '',
  message: '',
  consent: false,
}

export function Booking({ language, estimatorSelections, estimatorVehicle }: BookingProps) {
  const copy = translations[language]
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [touched, setTouched] = useState<Partial<Record<BookingField, boolean>>>({})
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [statusError, setStatusError] = useState('')
  const [requestReference, setRequestReference] = useState('')
  const lastSubmission = useRef('')
  const submissionInFlight = useRef(false)
  const minDate = useMemo(getLocalDate, [])
  const estimate = useMemo(
    () => calculateEstimate(values.serviceIds, estimatorVehicle),
    [estimatorVehicle, values.serviceIds],
  )

  useEffect(() => {
    if (!estimatorSelections.length) return
    setValues((current) => ({ ...current, serviceIds: [...estimatorSelections] }))
  }, [estimatorSelections])

  const errors = useMemo(() => validateBooking(values, minDate), [minDate, values])

  const updateValue = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
    if (status !== 'loading') {
      setStatus('idle')
      setRequestReference('')
    }
    setStatusError('')
  }

  const markTouched = (field: BookingField) => setTouched((current) => ({ ...current, [field]: true }))

  const toggleService = (id: ServiceId) => {
    updateValue('serviceIds', values.serviceIds.includes(id) ? values.serviceIds.filter((item) => item !== id) : [...values.serviceIds, id])
    markTouched('serviceIds')
  }

  const fieldError = (field: BookingField) => {
    const errorCode = touched[field] ? errors[field] : undefined
    return errorCode ? copy.booking.errors[errorCode] : ''
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const fieldOrder: BookingField[] = ['name', 'phone', 'email', 'vehicle', 'serviceIds', 'date', 'message', 'consent']
    setTouched(fieldOrder.reduce((result, field) => ({ ...result, [field]: true }), {}))
    const firstInvalid = fieldOrder.find((field) => Boolean(errors[field]))

    if (firstInvalid) {
      window.setTimeout(() => {
        const selector = firstInvalid === 'serviceIds'
          ? '.booking-services input'
          : firstInvalid === 'consent'
            ? '.consent-field input'
            : `#booking-${firstInvalid}`
        document.querySelector<HTMLElement>(selector)?.focus()
      }, 0)
      return
    }

    const fingerprint = buildSubmissionFingerprint(values)
    if (isDuplicateSubmission(fingerprint, lastSubmission.current, submissionInFlight.current)) {
      setStatus('error')
      setStatusError(copy.booking.errors.duplicate)
      return
    }

    const cleanValues = sanitizeBookingValues(values)
    const reference = generateRequestReference()
    const consentTimestamp = new Date().toISOString()
    const serviceNames = cleanValues.serviceIds.map((id) => copy.serviceNames[id])
    const payload = buildGoogleFormsPayload({
      requestReference: reference,
      name: cleanValues.name,
      normalizedPhone: cleanValues.phone,
      email: cleanValues.email,
      vehicle: cleanValues.vehicle,
      serviceIds: cleanValues.serviceIds,
      serviceNames,
      vehicleId: estimatorVehicle,
      selectedDate: cleanValues.date,
      language,
      message: cleanValues.message,
      consentTimestamp,
    })

    submissionInFlight.current = true
    setRequestReference(reference)
    setStatus('loading')

    try {
      await fetch(siteConfig.googleForms.action, {
        method: 'POST',
        mode: 'no-cors',
        body: payload,
      })
      lastSubmission.current = fingerprint
      setStatus('attempted')
    } catch {
      setStatus('error')
      setStatusError(copy.booking.errors.generic)
    } finally {
      submissionInFlight.current = false
    }
  }

  const fallbackMailto = siteConfig.bookingEmail
    ? `mailto:${siteConfig.bookingEmail}?subject=${encodeURIComponent(`${siteConfig.businessName} request ${requestReference || ''}`)}`
    : null

  const formatPrice = (value: number) => new Intl.NumberFormat(copy.locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)

  return (
    <section className="section booking-section" id="booking">
      <div className="container booking-layout">
        <div className="booking-intro">
          <SectionIntro eyebrow={copy.booking.eyebrow} title={copy.booking.title} body={copy.booking.body} />
          <div className="booking-trust" data-reveal><ShieldCheck size={22} aria-hidden="true" /><p>{copy.booking.pendingNotice}</p></div>
        </div>

        <form className="booking-form" noValidate onSubmit={submit} data-reveal>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="booking-name">{copy.booking.name}</label>
              <input id="booking-name" name="name" type="text" autoComplete="name" maxLength={BOOKING_LIMITS.name} value={values.name} placeholder={copy.booking.placeholders.name} onChange={(event) => updateValue('name', event.target.value)} onBlur={() => markTouched('name')} aria-invalid={Boolean(fieldError('name'))} aria-describedby={fieldError('name') ? 'booking-name-error' : undefined} />
              {fieldError('name') && <span className="field-error" id="booking-name-error">{fieldError('name')}</span>}
            </div>
            <div className="field">
              <label htmlFor="booking-phone">{copy.booking.phone}</label>
              <input id="booking-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={BOOKING_LIMITS.phone} value={values.phone} placeholder={copy.booking.placeholders.phone} onChange={(event) => updateValue('phone', event.target.value)} onBlur={() => markTouched('phone')} aria-invalid={Boolean(fieldError('phone'))} aria-describedby={fieldError('phone') ? 'booking-phone-error' : undefined} />
              {fieldError('phone') && <span className="field-error" id="booking-phone-error">{fieldError('phone')}</span>}
            </div>
            <div className="field">
              <label htmlFor="booking-email">{copy.booking.email}</label>
              <input id="booking-email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={BOOKING_LIMITS.email} value={values.email} placeholder={copy.booking.placeholders.email} onChange={(event) => updateValue('email', event.target.value)} onBlur={() => markTouched('email')} aria-invalid={Boolean(fieldError('email'))} aria-describedby={fieldError('email') ? 'booking-email-error' : undefined} />
              {fieldError('email') && <span className="field-error" id="booking-email-error">{fieldError('email')}</span>}
            </div>
            <div className="field">
              <label htmlFor="booking-vehicle">{copy.booking.vehicle}</label>
              <input id="booking-vehicle" name="vehicle" type="text" autoComplete="off" maxLength={BOOKING_LIMITS.vehicle} value={values.vehicle} placeholder={copy.booking.placeholders.vehicle} onChange={(event) => updateValue('vehicle', event.target.value)} onBlur={() => markTouched('vehicle')} aria-invalid={Boolean(fieldError('vehicle'))} aria-describedby={fieldError('vehicle') ? 'booking-vehicle-error' : undefined} />
              {fieldError('vehicle') && <span className="field-error" id="booking-vehicle-error">{fieldError('vehicle')}</span>}
            </div>
          </div>

          <fieldset className="booking-services" aria-invalid={Boolean(fieldError('serviceIds'))} aria-describedby={fieldError('serviceIds') ? 'booking-services-error' : undefined}>
            <legend>{copy.booking.services}</legend>
            <div>
              {services.map((service) => {
                const checked = values.serviceIds.includes(service.id)
                return (
                  <label key={service.id} className={checked ? 'is-selected' : ''}>
                    <input type="checkbox" checked={checked} onChange={() => toggleService(service.id)} />
                    <span>{checked && <Check size={13} aria-hidden="true" />}</span>{copy.serviceNames[service.id]}
                  </label>
                )
              })}
            </div>
            {fieldError('serviceIds') && <span className="field-error" id="booking-services-error">{fieldError('serviceIds')}</span>}
          </fieldset>

          {values.serviceIds.length > 0 && (
            <div className="booking-estimate" aria-label={copy.booking.estimateLabel}>
              <div><span>{copy.booking.estimateVehicle}</span><strong>{copy.estimator.vehicles[estimatorVehicle]} × {estimate.multiplier.toFixed(2)}</strong></div>
              <div><span>{copy.booking.estimatePrice}</span><strong>{formatPrice(estimate.estimatedTotal)}</strong></div>
              <div><span>{copy.booking.estimateDuration}</span><strong>{estimate.estimatedHours} h</strong></div>
              <small>{copy.booking.clientEstimate} · {copy.booking.pricingVersion}: {estimate.pricingVersion}</small>
            </div>
          )}

          <div className="field">
            <label htmlFor="booking-date">{copy.booking.date}</label>
            <input id="booking-date" name="date" type="date" min={minDate} value={values.date} onChange={(event) => updateValue('date', event.target.value)} onBlur={() => markTouched('date')} aria-invalid={Boolean(fieldError('date'))} aria-describedby={fieldError('date') ? 'booking-date-error' : undefined} />
            {fieldError('date') && <span className="field-error" id="booking-date-error">{fieldError('date')}</span>}
          </div>

          <div className="field">
            <label htmlFor="booking-message">{copy.booking.message}<small>{copy.booking.optional}</small></label>
            <textarea id="booking-message" name="message" rows={4} maxLength={BOOKING_LIMITS.message} value={values.message} placeholder={copy.booking.placeholders.message} onChange={(event) => updateValue('message', event.target.value)} onBlur={() => markTouched('message')} aria-invalid={Boolean(fieldError('message'))} aria-describedby={fieldError('message') ? 'booking-message-error' : undefined} />
            {fieldError('message') && <span className="field-error" id="booking-message-error">{fieldError('message')}</span>}
          </div>

          <label className="consent-field">
            <input type="checkbox" checked={values.consent} onChange={(event) => updateValue('consent', event.target.checked)} onBlur={() => markTouched('consent')} aria-invalid={Boolean(fieldError('consent'))} aria-describedby={fieldError('consent') ? 'booking-consent-error' : undefined} />
            <span className="checkbox-ui">{values.consent && <Check size={15} aria-hidden="true" />}</span><span>{copy.booking.consent}</span>
          </label>
          {fieldError('consent') && <span className="field-error consent-error" id="booking-consent-error">{fieldError('consent')}</span>}

          <button className="button button--copper button--full booking-submit" type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? <LoaderCircle className="spin" size={19} aria-hidden="true" /> : <Send size={19} aria-hidden="true" />}
            {status === 'loading' ? copy.booking.submitting : copy.booking.submit}
          </button>

          <div className={`form-status form-status--${status}`} aria-live="polite">
            {status === 'attempted' && (
              <>
                <strong>{copy.booking.attempted}</strong>
                <span>{copy.booking.attemptedDetail}</span>
                <span className="request-reference">{copy.booking.reference}: <b>{requestReference}</b></span>
                <small>{copy.booking.referenceNotice}</small>
                {fallbackMailto
                  ? <a href={fallbackMailto}>{copy.booking.fallback}</a>
                  : <span>{copy.booking.fallbackUnavailable}</span>}
              </>
            )}
            {status === 'error' && (
              <strong>
                {statusError}
                {fallbackMailto
                  ? <> <a href={fallbackMailto}>{siteConfig.bookingEmail}</a></>
                  : <> {copy.booking.fallbackUnavailable}</>}
              </strong>
            )}
          </div>
        </form>
      </div>
    </section>
  )
}
