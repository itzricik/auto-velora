import { Camera, Check, LoaderCircle, RotateCcw, Send, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookingApiError, createApiReservation, fetchAvailability, finalizeReservationMedia, uploadReservationMedia } from '../booking/apiClient'
import { usePublicCatalog } from '../booking/CatalogContext'
import { prepareVehicleImage } from '../booking/images'
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

type PhotoUpload = {
  clientId: string
  file: File
  previewUrl: string
  status: 'pending' | 'uploading' | 'complete' | 'failed'
  progress: number
  error?: string
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
  const { catalog, status: catalogStatus } = usePublicCatalog()
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
  const [serverPriceMaxCents, setServerPriceMaxCents] = useState(0)
  const [serverDurationMinMinutes, setServerDurationMinMinutes] = useState(0)
  const [conditionLevelId, setConditionLevelId] = useState('')
  const [conditionIndicatorIds, setConditionIndicatorIds] = useState<string[]>([])
  const [conditionNotes, setConditionNotes] = useState('')
  const [photos, setPhotos] = useState<PhotoUpload[]>([])
  const [photoError, setPhotoError] = useState('')
  const [overnightAcknowledged, setOvernightAcknowledged] = useState(false)
  const [availabilityStatus, setAvailabilityStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [availabilityRevision, setAvailabilityRevision] = useState(0)
  const [form, setForm] = useState<FormValues>(emptyForm)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormValues | 'services' | 'date' | 'slot' | 'overnight' | 'condition', string>>>({})
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorCode, setErrorCode] = useState('')
  const [result, setResult] = useState<PublicReservationResult | null>(null)
  const idempotencyKey = useRef('')
  const conditionLevels = catalog?.conditionLevels ?? []
  const conditionIndicators = catalog?.conditionIndicators ?? []

  useEffect(() => setVehicle(estimatorVehicle), [estimatorVehicle])
  useEffect(() => {
    setConditionLevelId((current) => current || catalog?.conditionLevels[0]?.id || '')
  }, [catalog])
  useEffect(() => {
    if (estimatorSelections.length) {
      setSelectedPackage('')
      setSelectedServices(estimatorSelections)
    }
  }, [estimatorSelections])

  const clientEstimate = useMemo(() => {
    const serviceIds = selectedPackage
      ? calculatePackagePrice(selectedPackage, vehicle, catalog).serviceIds
      : selectedServices
    return calculateEstimate(serviceIds, vehicle, catalog)
  }, [catalog, selectedPackage, selectedServices, vehicle])
  const bookingPrice = selectedPackage
    ? calculatePackagePrice(selectedPackage, vehicle, catalog)
    : clientEstimate
  const clientPriceCents = bookingPrice.estimatedTotal * 100
  const availabilityServiceIds = useMemo(() => selectedPackage
    ? []
    : selectedServices.flatMap((id) => {
      const service = catalog?.services.find((item) => item.code === id)
      return service ? [service.id] : []
    }), [catalog, selectedPackage, selectedServices])

  useEffect(() => {
    setSelectedStart('')
    setOvernightAcknowledged(false)
    setSlots([])
    setNearest(null)
    setServerDurationMinutes(0)
    setServerPriceCents(0)
    setServerPriceMaxCents(0)
    setServerDurationMinMinutes(0)
    if ((!selectedPackage && !selectedServices.length) || !conditionLevelId) {
      setAvailabilityStatus('idle')
      return
    }
    const controller = new AbortController()
    setAvailabilityStatus('loading')
    const timeout = window.setTimeout(() => {
      fetchAvailability({
        date,
        vehicleCategoryId: catalog?.vehicleCategories.find((item) => item.code === vehicle)?.id ?? '',
        serviceIds: availabilityServiceIds,
        packageId: selectedPackage ? catalog?.packages.find((item) => item.code === selectedPackage)?.id : undefined,
        language,
        conditionLevelId,
        conditionIndicatorIds,
      }, controller.signal).then((response) => {
        setSlots(response.slots)
        setNearest(response.nearest)
        setServerDurationMinutes(response.serverEstimate.durationMinutes)
        setServerPriceCents(response.serverEstimate.priceCents)
        setServerPriceMaxCents(response.serverEstimate.priceMaxCents)
        setServerDurationMinMinutes(response.serverEstimate.durationMinMinutes)
        setAvailabilityStatus('ready')
      }).catch((error) => {
        if ((error as Error).name !== 'AbortError') setAvailabilityStatus('error')
      })
    }, 180)
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [availabilityRevision, availabilityServiceIds, catalog, conditionIndicatorIds, conditionLevelId, date, language, selectedPackage, selectedServices.length, vehicle])

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

  const updatePhoto = (clientId: string, patch: Partial<PhotoUpload>) => {
    setPhotos((current) => current.map((photo) => photo.clientId === clientId ? { ...photo, ...patch } : photo))
  }

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    setPhotoError('')
    const remaining = 6 - photos.length
    if (files.length > remaining) setPhotoError(copy.photoLimit)
    for (const original of [...files].slice(0, Math.max(0, remaining))) {
      try {
        const file = await prepareVehicleImage(original)
        const clientId = crypto.randomUUID()
        setPhotos((current) => [...current, {
          clientId,
          file,
          previewUrl: URL.createObjectURL(file),
          status: 'pending',
          progress: 0,
        }])
      } catch (error) {
        setPhotoError(error instanceof Error && error.message === 'IMAGE_TOO_LARGE' ? copy.photoTooLarge : copy.photoInvalid)
      }
    }
  }

  const removePhoto = (clientId: string) => {
    setPhotos((current) => {
      const photo = current.find((item) => item.clientId === clientId)
      if (photo) URL.revokeObjectURL(photo.previewUrl)
      return current.filter((item) => item.clientId !== clientId)
    })
  }

  const uploadOnePhoto = async (
    upload: PublicReservationResult['mediaUploads'][number],
    photo: PhotoUpload,
  ) => {
    updatePhoto(photo.clientId, { status: 'uploading', progress: 0, error: undefined })
    try {
      await uploadReservationMedia(upload, photo.file, (progress) => updatePhoto(photo.clientId, { progress }))
      await finalizeReservationMedia({ mediaId: upload.mediaId, finalizeToken: upload.finalizeToken })
      updatePhoto(photo.clientId, { status: 'complete', progress: 100 })
    } catch {
      updatePhoto(photo.clientId, { status: 'failed', error: copy.uploadFailed })
      throw new Error('MEDIA_UPLOAD_FAILED')
    }
  }

  const uploadPhotos = async (response: PublicReservationResult) => {
    const uploadByClient = new Map(response.mediaUploads.map((upload) => [upload.clientId, upload]))
    await Promise.allSettled(photos.map(async (photo) => {
      const upload = uploadByClient.get(photo.clientId)
      if (!upload) {
        updatePhoto(photo.clientId, { status: 'failed', error: copy.uploadFailed })
        return
      }
      await uploadOnePhoto(upload, photo)
    }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const errors: typeof fieldErrors = {}
    if (!selectedPackage && !selectedServices.length) errors.services = copy.validation
    if (!conditionLevelId) errors.condition = copy.validation
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
        vehicleCategoryId: catalog?.vehicleCategories.find((item) => item.code === vehicle)?.id ?? '',
        vehicleDescription: form.vehicleDescription.trim(),
        serviceIds: selectedPackage ? [] : selectedServices.flatMap((id) => {
          const service = catalog?.services.find((item) => item.code === id)
          return service ? [service.id] : []
        }),
        packageId: selectedPackage ? catalog?.packages.find((item) => item.code === selectedPackage)?.id : undefined,
        requestedStart: selectedStart,
        language,
        customerNotes: form.notes.trim() || undefined,
        consentAccepted: form.consent,
        consentPolicyVersion: siteConfig.consentPolicyVersion,
        idempotencyKey: idempotencyKey.current,
        company: form.company,
        turnstileToken: turnstileToken || undefined,
        overnightAcknowledged,
        condition: {
          levelId: conditionLevelId,
          indicatorIds: conditionIndicatorIds,
          notes: conditionNotes.trim() || undefined,
        },
        media: photos.map((photo) => ({
          clientId: photo.clientId,
          filename: photo.file.name,
          mimeType: photo.file.type as 'image/jpeg' | 'image/png' | 'image/webp',
          size: photo.file.size,
        })),
      })
      await uploadPhotos(response)
      setResult(response)
      setStatus('success')
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
            <div><dt>{copy.serverEstimate}</dt><dd>{result.estimatedPriceMinCents === result.estimatedPriceMaxCents ? formatPrice(result.estimatedPriceMinCents) : `${formatPrice(result.estimatedPriceMinCents)}–${formatPrice(result.estimatedPriceMaxCents)}`}</dd></div>
            <div><dt>{copy.date}</dt><dd>{new Intl.DateTimeFormat(common.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Riga' }).format(new Date(result.start))}</dd></div>
            <div><dt>{copy.duration}</dt><dd>{result.estimatedDurationMinMinutes === result.estimatedDurationMaxMinutes ? `${result.estimatedDurationMaxMinutes} ${copy.minutes}` : `${result.estimatedDurationMinMinutes}–${result.estimatedDurationMaxMinutes} ${copy.minutes}`}</dd></div>
          </dl>
          {photos.length > 0 && <section className="booking-photo-results" aria-label={copy.photos}>
            <h3>{copy.photos}</h3>
            <div className="booking-photo-grid">{photos.map((photo) => {
              const upload = result.mediaUploads.find((item) => item.clientId === photo.clientId)
              return <article key={photo.clientId}>
                <img src={photo.previewUrl} alt="" />
                <p>{photo.status === 'complete' ? copy.uploadComplete : photo.status === 'uploading' ? copy.uploading.replace('{progress}', String(photo.progress)) : photo.status === 'failed' ? copy.uploadFailed : copy.uploadPending}</p>
                {photo.status === 'failed' && upload && <button type="button" className="button button--outline" onClick={() => void uploadOnePhoto(upload, photo)}><RotateCcw size={15} /> {copy.retryPhoto}</button>}
              </article>
            })}</div>
          </section>}
          <p className="condition-disclaimer">{copy.conditionDisclaimer}</p>
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
              {vehicleTypes.filter((item) => catalog?.vehicleCategories.some((entry) => entry.code === item.id)).map((item) => {
                const live = catalog?.vehicleCategories.find((entry) => entry.code === item.id)
                return (
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
                  <em>×{new Intl.NumberFormat(common.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(live?.price_multiplier ?? 0))}</em>
                </label>
              )})}
            </div>
          </fieldset>

          <fieldset className="booking-services">
            <legend>{copy.package}</legend>
            <div>
              <label className={!selectedPackage ? 'is-selected' : ''}>
                <input type="radio" name="package" checked={!selectedPackage} onChange={() => selectPackage('')} />
                <span>{!selectedPackage && <Check size={13} />}</span>{copy.custom}
              </label>
              {packages.filter((item) => catalog?.packages.some((entry) => entry.code === item.id)).map((item) => (
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
              <div>{services.filter((service) => catalog?.services.some((entry) => entry.code === service.id)).map((service) => (
                <label key={service.id} className={selectedServices.includes(service.id) ? 'is-selected' : ''}>
                  <input type="checkbox" checked={selectedServices.includes(service.id)} onChange={() => toggleService(service.id)} />
                  <span>{selectedServices.includes(service.id) && <Check size={13} />}</span>{common.serviceNames[service.id]}
                </label>
              ))}</div>
            </fieldset>
          )}

          <fieldset className="booking-condition">
            <legend>{copy.conditionTitle}</legend>
            <p>{copy.conditionHelp}</p>
            {catalogStatus === 'loading' && <p><LoaderCircle className="spin" size={17} /> {copy.loading}</p>}
            {catalogStatus === 'error' && <p className="field-error" role="alert">{copy.unavailable}</p>}
            {catalogStatus === 'ready' && <div className="condition-levels">{conditionLevels.map((level) => {
              const label = language === 'lv' ? level.label_lv : language === 'ru' ? level.label_ru : level.label_en
              const explanation = language === 'lv' ? level.explanation_lv : language === 'ru' ? level.explanation_ru : level.explanation_en
              return <label key={level.id} className={conditionLevelId === level.id ? 'is-selected' : ''}>
                <input type="radio" name="vehicle-condition" checked={conditionLevelId === level.id} onChange={() => { setConditionLevelId(level.id); setFieldErrors((current) => ({ ...current, condition: undefined })) }} />
                <span>{conditionLevelId === level.id && <Check size={13} />}</span>
                <strong>{label}</strong>
                <small>{explanation}</small>
              </label>
            })}</div>}
            {fieldErrors.condition && <p className="field-error">{fieldErrors.condition}</p>}
          </fieldset>

          {catalogStatus === 'ready' && conditionIndicators.length > 0 && <fieldset className="booking-services condition-indicators">
            <legend>{copy.conditionIndicators}</legend>
            <div>{conditionIndicators.map((indicator) => {
              const checked = conditionIndicatorIds.includes(indicator.id)
              const label = language === 'lv' ? indicator.label_lv : language === 'ru' ? indicator.label_ru : indicator.label_en
              return <label key={indicator.id} className={checked ? 'is-selected' : ''}>
                <input type="checkbox" checked={checked} onChange={() => setConditionIndicatorIds((current) => checked ? current.filter((id) => id !== indicator.id) : [...current, indicator.id])} />
                <span>{checked && <Check size={13} />}</span>{label}
              </label>
            })}</div>
          </fieldset>}
          <div className="field"><label htmlFor="api-condition-notes">{copy.conditionNotes}</label><textarea id="api-condition-notes" maxLength={1000} value={conditionNotes} onChange={(event) => setConditionNotes(event.target.value)} /></div>

          {(selectedPackage || selectedServices.length > 0) && (
            <div className="booking-estimate booking-estimate--live" aria-live="polite">
              <div><span>{common.estimator.subtotal}</span><strong>{formatPrice(bookingPrice.baseTotal * 100)}</strong></div>
              <div><span>{common.estimator.sizeAdjustment}</span><strong>× {new Intl.NumberFormat(common.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bookingPrice.multiplier)}</strong></div>
              <div className="booking-estimate__total"><span>{copy.estimatedPriceRange}</span><strong>{serverPriceMaxCents > 0 && serverPriceMaxCents !== serverPriceCents ? `${formatPrice(serverPriceCents)}–${formatPrice(serverPriceMaxCents)}` : formatPrice(serverPriceCents || clientPriceCents)}</strong></div>
              {serverDurationMinutes > 0 && <div><span>{copy.estimatedDurationRange}</span><strong>{serverDurationMinMinutes !== serverDurationMinutes ? `${serverDurationMinMinutes}–${serverDurationMinutes}` : serverDurationMinutes} {copy.minutes}</strong></div>}
              <small>{copy.conditionDisclaimer}</small>
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
          <fieldset className="booking-photos">
            <legend>{copy.photos}</legend>
            <p>{copy.photosHelp}</p>
            <label className="photo-input button button--outline">
              <Camera size={17} /> {copy.addPhotos}
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple disabled={photos.length >= 6} onChange={(event) => { void addPhotos(event.target.files); event.target.value = '' }} />
            </label>
            {photoError && <p className="field-error" role="alert">{photoError}</p>}
            {photos.length > 0 && <div className="booking-photo-grid">{photos.map((photo) => <article key={photo.clientId}>
              <img src={photo.previewUrl} alt="" />
              <div className="photo-progress" aria-label={photo.status === 'uploading' ? copy.uploading.replace('{progress}', String(photo.progress)) : copy.uploadPending}><span style={{ width: `${photo.progress}%` }} /></div>
              <p>{photo.status === 'complete' ? copy.uploadComplete : photo.status === 'uploading' ? copy.uploading.replace('{progress}', String(photo.progress)) : photo.status === 'failed' ? copy.uploadFailed : copy.uploadPending}</p>
              <button type="button" aria-label={`${copy.removePhoto}: ${photo.file.name}`} onClick={() => removePhoto(photo.clientId)} disabled={photo.status === 'uploading'}><Trash2 size={16} /> {copy.removePhoto}</button>
            </article>)}</div>}
          </fieldset>
          <div className="field api-honeypot" aria-hidden="true"><label htmlFor="api-company">{copy.honeypot}</label><input id="api-company" tabIndex={-1} autoComplete="off" value={form.company} onChange={(event) => updateForm('company', event.target.value)} /></div>
          <label className="consent-field"><input type="checkbox" checked={form.consent} onChange={(event) => updateForm('consent', event.target.checked)} /><span className="checkbox-ui">{form.consent && <Check size={15} />}</span><span>{copy.consent}</span></label>
          {fieldErrors.consent && <p className="field-error">{fieldErrors.consent}</p>}
          <TurnstileWidget onTokenChange={setTurnstileToken} />
          {errorMessage && <div role="alert"><p className="field-error">{errorMessage}</p><button type="button" className="button button--outline" onClick={() => { setAvailabilityRevision((current) => current + 1); setStatus('idle') }}>{copy.retry}</button></div>}
          <button className="button button--copper button--full booking-submit" type="submit" disabled={status === 'submitting' || catalogStatus !== 'ready'}>
            {status === 'submitting' ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}
            {status === 'submitting' ? copy.submitting : copy.submit}
          </button>
        </form>
      </div>
    </section>
  )
}
