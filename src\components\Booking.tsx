import { Check, LoaderCircle, Send, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { services, type ServiceId } from '../data'
import { siteConfig } from '../config/site'
import { translations, type Language } from '../i18n/translations'
import { SectionIntro } from './SectionIntro'

type BookingProps = {
  language: Language
  estimatorSelections: ServiceId[]
}

type FormValues = {
  name: string
  phone: string
  email: string
  vehicle: string
  serviceIds: ServiceId[]
  date: string
  message: string
  consent: boolean
}

type FieldKey = keyof FormValues
type SubmitStatus = 'idle' | 'loading' | 'submitted' | 'error'

function getLocalDate() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

export function Booking({ language, estimatorSelections }: BookingProps) {
  const copy = translations[language]
  const [values, setValues] = useState<FormValues>({ name: '', phone: '', email: '', vehicle: '', serviceIds: [], date: '', message: '', consent: false })
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({})
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [statusError, setStatusError] = useState('')
  const lastSubmission = useRef('')
  const minDate = useMemo(getLocalDate, [])

  useEffect(() => {
    if (!estimatorSelections.length) return
    setValues((current) => ({ ...current, serviceIds: [...estimatorSelections] }))
  }, [estimatorSelections])

  const errors = useMemo(() => {
    const phoneDigits = values.phone.replace(/\D/g, '')
    return {
      name: values.name.trim().length >= 2 ? '' : copy.booking.errors.name,
      phone: phoneDigits.length >= 8 ? '' : copy.booking.errors.phone,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) ? '' : copy.booking.errors.email,
      vehicle: values.vehicle.trim().length >= 2 ? '' : copy.booking.errors.vehicle,
      serviceIds: values.serviceIds.length ? '' : copy.booking.errors.services,
      date: values.date && values.date >= minDate ? '' : copy.booking.errors.date,
      consent: values.consent ? '' : copy.booking.errors.consent,
    }
  }, [copy.booking.errors, minDate, values])

  const updateValue = <K extends FieldKey>(field: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
    if (status !== 'loading') setStatus('idle')
    setStatusError('')
  }

  const markTouched = (field: FieldKey) => setTouched((current) => ({ ...current, [field]: true }))

  const toggleService = (id: ServiceId) => {
    updateValue('serviceIds', values.serviceIds.includes(id) ? values.serviceIds.filter((item) => item !== id) : [...values.serviceIds, id])
    markTouched('serviceIds')
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const requiredFields: Array<keyof typeof errors> = ['name', 'phone', 'email', 'vehicle', 'serviceIds', 'date', 'consent']
    setTouched(requiredFields.reduce((result, field) => ({ ...result, [field]: true }), {}))
    const firstInvalid = requiredFields.find((field) => Boolean(errors[field]))
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

    const signature = JSON.stringify(values)
    if (lastSubmission.current === signature) {
      setStatus('error')
      setStatusError(copy.booking.errors.duplicate)
      return
    }

    setStatus('loading')
    const serviceList = values.serviceIds.map((id) => translations.en.serviceNames[id]).join(', ')
    const [year, month, day] = values.date.split('-')
    const fields = siteConfig.googleForms.fields
    const payload = new URLSearchParams({
      [fields.name]: values.name.trim(),
      [fields.phone]: values.phone.trim(),
      [fields.email]: values.email.trim(),
      [fields.vehicle]: values.vehicle.trim(),
      [fields.services]: serviceList,
      [fields.message]: values.message.trim(),
      [fields.consent]: 'Yes',
      [fields.language]: language.toUpperCase(),
      [fields.dateYear]: year,
      [fields.dateMonth]: month,
      [fields.dateDay]: day,
    })

    try {
      await fetch(siteConfig.googleForms.action, {
        method: 'POST',
        mode: 'no-cors',
        body: payload,
      })
      lastSubmission.current = signature
      setStatus('submitted')
    } catch {
      setStatus('error')
      setStatusError(copy.booking.errors.generic)
    }
  }

  const fieldError = (field: keyof typeof errors) => touched[field] ? errors[field] : ''

  return (
    <section className="section booking-section" id="booking">
      <div className="container booking-layout">
        <div className="booking-intro">
          <SectionIntro eyebrow={copy.booking.eyebrow} title={copy.booking.title} body={copy.booking.body} />
          <div className="booking-trust" data-reveal><ShieldCheck size={22} aria-hidden="true" /><p>{copy.estimator.disclaimer}</p></div>
        </div>

        <form className="booking-form" noValidate onSubmit={submit} data-reveal>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="booking-name">{copy.booking.name}</label>
              <input id="booking-name" name="name" type="text" autoComplete="name" value={values.name} placeholder={copy.booking.placeholders.name} onChange={(event) => updateValue('name', event.target.value)} onBlur={() => markTouched('name')} aria-invalid={Boolean(fieldError('name'))} aria-describedby={fieldError('name') ? 'booking-name-error' : undefined} />
              {fieldError('name') && <span className="field-error" id="booking-name-error">{fieldError('name')}</span>}
            </div>
            <div className="field">
              <label htmlFor="booking-phone">{copy.booking.phone}</label>
              <input id="booking-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={values.phone} placeholder={copy.booking.placeholders.phone} onChange={(event) => updateValue('phone', event.target.value)} onBlur={() => markTouched('phone')} aria-invalid={Boolean(fieldError('phone'))} aria-describedby={fieldError('phone') ? 'booking-phone-error' : undefined} />
              {fieldError('phone') && <span className="field-error" id="booking-phone-error">{fieldError('phone')}</span>}
            </div>
            <div className="field">
              <label htmlFor="booking-email">{copy.booking.email}</label>
              <input id="booking-email" name="email" type="email" inputMode="email" autoComplete="email" value={values.email} placeholder={copy.booking.placeholders.email} onChange={(event) => updateValue('email', event.target.value)} onBlur={() => markTouched('email')} aria-invalid={Boolean(fieldError('email'))} aria-describedby={fieldError('email') ? 'booking-email-error' : undefined} />
              {fieldError('email') && <span className="field-error" id="booking-email-error">{fieldError('email')}</span>}
            </div>
            <div className="field">
              <label htmlFor="booking-vehicle">{copy.booking.vehicle}</label>
              <input id="booking-vehicle" name="vehicle" type="text" autoComplete="off" value={values.vehicle} placeholder={copy.booking.placeholders.vehicle} onChange={(event) => updateValue('vehicle', event.target.value)} onBlur={() => markTouched('vehicle')} aria-invalid={Boolean(fieldError('vehicle'))} aria-describedby={fieldError('vehicle') ? 'booking-vehicle-error' : undefined} />
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

          <div className="field">
            <label htmlFor="booking-date">{copy.booking.date}</label>
            <input id="booking-date" name="date" type="date" min={minDate} value={values.date} onChange={(event) => updateValue('date', event.target.value)} onBlur={() => markTouched('date')} aria-invalid={Boolean(fieldError('date'))} aria-describedby={fieldError('date') ? 'booking-date-error' : undefined} />
            {fieldError('date') && <span className="field-error" id="booking-date-error">{fieldError('date')}</span>}
          </div>

          <div className="field">
            <label htmlFor="booking-message">{copy.booking.message}<small>{copy.booking.optional}</small></label>
            <textarea id="booking-message" name="message" rows={4} value={values.message} placeholder={copy.booking.placeholders.message} onChange={(event) => updateValue('message', event.target.value)} />
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
            {status === 'submitted' && <><strong>{copy.booking.submitted}</strong><span>{copy.booking.submittedDetail}</span></>}
            {status === 'error' && <strong>{statusError} <a href={`mailto:${siteConfig.bookingEmail}`}>{siteConfig.bookingEmail}</a></strong>}
          </div>
        </form>
      </div>
    </section>
  )
}
