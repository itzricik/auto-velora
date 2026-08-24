import { ArrowLeft, Check, ChevronRight, Clock3, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchAvailability } from '../booking/apiClient'
import { normalizePhone } from '../booking/validation'
import { siteConfig } from '../config/site'
import type { AvailabilitySlot, BookingLanguage } from '../shared/contracts'
import type { PublicCatalog } from '../shared/publicCatalog'
import type { TelegramProfile } from '../shared/telegram'
import { createTelegramBooking, TelegramApiError, updateTelegramProfile } from './api'
import { telegramCopy } from './copy'
import type { TelegramWebApp } from './telegram-sdk'

function localized(item: Record<string, unknown>, field: string, language: BookingLanguage): string {
  return String(item[`${field}_${language}`] ?? item[`${field}_en`] ?? '')
}

function money(cents: number, language: BookingLanguage): string {
  return new Intl.NumberFormat(language === 'ru' ? 'ru-LV' : language === 'lv' ? 'lv-LV' : 'en-LV', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

function futureDate(): string {
  const date = new Date(Date.now() + 2 * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

type Props = {
  app: TelegramWebApp | null
  token: string
  profile: TelegramProfile
  catalog: PublicCatalog
  language: BookingLanguage
  initialServiceIds: string[]
  onProfile: (profile: TelegramProfile) => void
  onDone: () => void
}

export function TelegramBookingFlow({ app, token, profile, catalog, language, initialServiceIds, onProfile, onDone }: Props) {
  const copy = telegramCopy[language]
  const [stage, setStage] = useState<'configure' | 'review' | 'success'>('configure')
  const [serviceIds, setServiceIds] = useState(initialServiceIds.filter((id) => catalog.services.some((service) => service.id === id)))
  const [vehicleChoice, setVehicleChoice] = useState(profile.vehicles[0]?.id ?? 'new')
  const savedVehicle = profile.vehicles.find((vehicle) => vehicle.id === vehicleChoice)
  const [vehicleCategoryId, setVehicleCategoryId] = useState(savedVehicle?.vehicleCategoryId ?? catalog.vehicleCategories[0]?.id ?? '')
  const [vehicleDescription, setVehicleDescription] = useState(savedVehicle?.makeModel ?? '')
  const [conditionLevelId, setConditionLevelId] = useState(catalog.conditionLevels[0]?.id ?? '')
  const [date, setDate] = useState(futureDate)
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [selectedStart, setSelectedStart] = useState('')
  const [estimate, setEstimate] = useState({ priceMinCents: 0, priceMaxCents: 0, durationMinMinutes: 0, durationMaxMinutes: 0 })
  const [availability, setAvailability] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [availabilityRevision, setAvailabilityRevision] = useState(0)
  const [name, setName] = useState(profile.customer?.fullName ?? `${profile.firstName} ${profile.lastName ?? ''}`.trim())
  const [phone, setPhone] = useState(profile.customer?.phone ?? '')
  const [email, setEmail] = useState(profile.customer?.email ?? '')
  const [notes, setNotes] = useState('')
  const [consent, setConsent] = useState(false)
  const [overnight, setOvernight] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [reference, setReference] = useState('')
  const idempotency = useRef(crypto.randomUUID())
  const submitRef = useRef<() => void>(() => undefined)
  const selectedSlot = slots.find((slot) => slot.start === selectedStart)

  useEffect(() => {
    if (savedVehicle) {
      setVehicleCategoryId(savedVehicle.vehicleCategoryId)
      setVehicleDescription(savedVehicle.makeModel)
    }
  }, [savedVehicle])

  const availabilityKey = useMemo(() => serviceIds.slice().sort().join(','), [serviceIds])
  useEffect(() => {
    setSelectedStart('')
    setSlots([])
    if (!serviceIds.length || !vehicleCategoryId || !conditionLevelId || !date) { setAvailability('idle'); return }
    const controller = new AbortController()
    setAvailability('loading')
    const timeout = window.setTimeout(() => fetchAvailability({
      date, vehicleCategoryId, serviceIds, language, conditionLevelId, conditionIndicatorIds: [],
    }, controller.signal).then((value) => {
      setSlots(value.slots)
      setEstimate(value.serverEstimate)
      setAvailability('ready')
    }).catch((reason) => {
      if ((reason as Error).name !== 'AbortError') setAvailability('error')
    }), 180)
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [availabilityKey, availabilityRevision, conditionLevelId, date, language, serviceIds, vehicleCategoryId])

  const valid = serviceIds.length > 0 && vehicleDescription.trim().length >= 2 && selectedStart
    && name.trim().length >= 2 && normalizePhone(phone).replace(/\D/g, '').length >= 8
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && consent
    && (!selectedSlot?.continuesNextWorkingDay || overnight)

  const submit = async () => {
    if (!valid || submitting) return
    setSubmitting(true)
    setError('')
    app?.MainButton.showProgress(true)
    try {
      const result = await createTelegramBooking(token, {
        name: name.trim(), email: email.trim().toLowerCase(), phone: normalizePhone(phone),
        vehicleCategoryId, vehicleDescription: vehicleDescription.trim(), serviceIds,
        requestedStart: selectedStart, language, customerNotes: notes.trim() || undefined,
        consentAccepted: true, consentPolicyVersion: siteConfig.consentPolicyVersion,
        idempotencyKey: idempotency.current, company: '', overnightAcknowledged: overnight,
        condition: { levelId: conditionLevelId, indicatorIds: [] },
        existingVehicleId: savedVehicle?.id,
      })
      setReference(result.reference)
      onProfile(result.profile)
      setStage('success')
      app?.HapticFeedback?.notificationOccurred('success')
      if (!result.profile.allowsWriteToPm) app?.requestWriteAccess?.((granted) => {
        if (!granted) return
        void updateTelegramProfile(token, { action: 'write_access', granted: true, reference: result.reference }).then(onProfile)
      })
    } catch (reason) {
      const code = reason instanceof TelegramApiError ? reason.code : 'API_ERROR'
      const scheduleChanged = code === 'SCHEDULING_CONFLICT' || code === 'INVALID_REQUESTED_START'
      setError(code === 'SCHEDULING_CONFLICT' ? copy.conflict
        : code === 'INVALID_REQUESTED_START' ? copy.invalidStart
          : code === 'OVERNIGHT_ACK_REQUIRED' ? copy.overnightRequired
            : code === 'RATE_LIMITED' ? copy.rateLimited
              : code === 'VALIDATION_FAILED' ? copy.validation
                : copy.error)
      if (scheduleChanged) {
        setSelectedStart('')
        setSlots([])
        setStage('configure')
        setAvailabilityRevision((current) => current + 1)
      } else if (code === 'OVERNIGHT_ACK_REQUIRED') {
        setOvernight(false)
        setStage('configure')
      }
      app?.HapticFeedback?.notificationOccurred('error')
    } finally {
      setSubmitting(false)
      app?.MainButton.hideProgress()
    }
  }
  submitRef.current = () => { void submit() }

  useEffect(() => {
    if (!app) return
    const invoke = () => submitRef.current()
    if (stage === 'review') {
      app.MainButton.setText(copy.submit)
      if (valid && !submitting) app.MainButton.enable(); else app.MainButton.disable()
      app.MainButton.show()
      app.MainButton.onClick(invoke)
    } else app.MainButton.hide()
    return () => { app.MainButton.offClick(invoke); app.MainButton.hide() }
  }, [app, copy.submit, stage, submitting, valid])

  if (stage === 'success') return <section className="tg-success"><span><Check size={34} /></span><h1>{copy.success}</h1><p>{copy.pending}</p><div><small>{copy.reference}</small><strong>{reference}</strong></div><button className="tg-primary" onClick={onDone}>{copy.close}</button></section>

  if (stage === 'review') return <section><button className="tg-back" onClick={() => setStage('configure')}><ArrowLeft size={17} />{copy.back}</button><div className="tg-section-head"><div><span>VELORA</span><h1>{copy.review}</h1></div></div><div className="tg-review"><article><small>{copy.vehicle}</small><strong>{vehicleDescription}</strong><span>{localized(catalog.vehicleCategories.find((item) => item.id === vehicleCategoryId) as unknown as Record<string, unknown>, 'name', language)}</span></article><article><small>{copy.services}</small><strong>{serviceIds.map((id) => localized(catalog.services.find((item) => item.id === id) as unknown as Record<string, unknown>, 'name', language)).join(', ')}</strong></article><article><small>{copy.available}</small><strong>{selectedSlot?.displayTime}</strong><span>{date}</span></article><article><small>{copy.total}</small><strong>{money(estimate.priceMinCents, language)}{estimate.priceMaxCents !== estimate.priceMinCents ? `–${money(estimate.priceMaxCents, language)}` : ''}</strong><span>{estimate.durationMinMinutes}–{estimate.durationMaxMinutes} {copy.minutes}</span></article></div>{error && <p className="tg-error" role="alert">{error}</p>}<button className="tg-primary tg-wide tg-browser-submit" disabled={!valid || submitting} onClick={() => void submit()}>{submitting ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}{copy.submit}</button></section>

  return <section><div className="tg-section-head"><div><span>VELORA</span><h1>{copy.book}</h1></div></div><div className="tg-step"><span>1</span><h2>{copy.chooseServices}</h2></div><div className="tg-chip-grid">{catalog.services.map((service) => <button key={service.id} className={serviceIds.includes(service.id) ? 'active' : ''} onClick={() => setServiceIds((current) => current.includes(service.id) ? current.filter((id) => id !== service.id) : [...current, service.id])}><span className="tg-check">{serviceIds.includes(service.id) ? '✓' : ''}</span><strong>{localized(service as unknown as Record<string, unknown>, 'name', language)}</strong><small>{money(service.base_price_cents, language)}</small></button>)}</div><div className="tg-step"><span>2</span><h2>{copy.vehicle}</h2></div>{profile.vehicles.length > 0 && <label className="tg-field">{copy.savedVehicle}<select value={vehicleChoice} onChange={(event) => setVehicleChoice(event.target.value)}>{profile.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.makeModel}</option>)}<option value="new">{copy.newVehicle}</option></select></label>}{!savedVehicle && <><label className="tg-field">{copy.makeModel}<input required maxLength={120} value={vehicleDescription} onChange={(event) => setVehicleDescription(event.target.value)} /></label><label className="tg-field">{copy.category}<select value={vehicleCategoryId} onChange={(event) => setVehicleCategoryId(event.target.value)}>{catalog.vehicleCategories.map((category) => <option key={category.id} value={category.id}>{localized(category as unknown as Record<string, unknown>, 'name', language)}</option>)}</select></label></>}<label className="tg-field">{copy.condition}<select value={conditionLevelId} onChange={(event) => setConditionLevelId(event.target.value)}>{catalog.conditionLevels.map((condition) => <option key={condition.id} value={condition.id}>{localized(condition as unknown as Record<string, unknown>, 'name', language)}</option>)}</select></label><div className="tg-step"><span>3</span><h2>{copy.available}</h2></div><label className="tg-field">{copy.date}<input type="date" value={date} min={new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga' }).format(new Date())} onChange={(event) => setDate(event.target.value)} /></label>{availability === 'loading' && <div className="tg-loading-row"><LoaderCircle className="spin" size={18} />{copy.loading}</div>}{availability === 'error' && <p className="tg-error">{copy.error}</p>}{availability === 'ready' && !slots.length && <p className="tg-muted">{copy.noSlots}</p>}<div className="tg-slots">{slots.map((slot) => <button className={selectedStart === slot.start ? 'active' : ''} key={slot.start} onClick={() => { setSelectedStart(slot.start); setOvernight(false); app?.HapticFeedback?.impactOccurred('light') }}><Clock3 size={16} />{slot.displayTime}</button>)}</div>{selectedSlot?.continuesNextWorkingDay && <label className="tg-consent"><input type="checkbox" checked={overnight} onChange={(event) => setOvernight(event.target.checked)} /><span>{copy.overnight}</span></label>}<div className="tg-estimate"><span>{copy.total}</span><strong>{money(estimate.priceMinCents, language)}{estimate.priceMaxCents !== estimate.priceMinCents ? `–${money(estimate.priceMaxCents, language)}` : ''}</strong><small>{estimate.durationMinMinutes}–{estimate.durationMaxMinutes} {copy.minutes}</small></div><div className="tg-step"><span>4</span><h2>{copy.details}</h2></div><div className="tg-fields"><label className="tg-field">{copy.name}<input autoComplete="name" maxLength={100} value={name} disabled={profile.linked} onChange={(event) => setName(event.target.value)} /></label><label className="tg-field">{copy.phone}<input type="tel" inputMode="tel" autoComplete="tel" maxLength={32} value={phone} disabled={profile.linked} onChange={(event) => setPhone(event.target.value)} /></label><label className="tg-field">{copy.email}<input type="email" inputMode="email" autoComplete="email" maxLength={254} value={email} disabled={profile.linked && Boolean(profile.customer?.email)} onChange={(event) => setEmail(event.target.value)} /></label><label className="tg-field">{copy.notes}<textarea maxLength={1500} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div><label className="tg-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>{copy.consent}</span></label>{error && <p className="tg-error" role="alert">{error}</p>}<button className="tg-primary tg-wide" disabled={!valid} onClick={() => setStage('review')}>{copy.continue}<ChevronRight size={18} /></button></section>
}
