import { Check, LoaderCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { completeAndRelease, previewReservation, saveReservation } from '../api'
import { displayTime, localStart, scheduleStartTimes } from '../schedule'
import type { Reservation, ReservationInput, ReservationStatus, SchedulePreview, Service, VehicleCategory, WorkBay } from '../types'

type Props = {
  reservation: Reservation | null
  selectedDate: string
  selectedStart: string | null
  selectedBayId: string | null
  services: Service[]
  vehicleCategories: VehicleCategory[]
  workBays: WorkBay[]
  startIntervalMinutes: number
  onClose: () => void
  onSaved: (date: string) => void
}

const blank = (props: Props): ReservationInput => ({
  fullName: '', phone: '', email: '', vehicleCategoryId: props.vehicleCategories[0]?.id ?? '',
  vehicleDescription: '', serviceIds: [], preferredDate: props.selectedDate,
  requestedStart: props.selectedStart ? localStart(props.selectedDate, props.selectedStart) : null,
  workBayId: props.selectedBayId ?? props.workBays.find((bay) => bay.is_active)?.id ?? null,
  status: 'confirmed', finalTotalCents: null, finalDurationMinutes: null, customerMessage: '', internalNotes: '', language: 'en', source: 'admin',
})

function fromReservation(reservation: Reservation, bays: WorkBay[]): ReservationInput {
  return {
    reservationId: reservation.id,
    fullName: reservation.customer.full_name,
    phone: reservation.customer.phone,
    email: reservation.customer.email ?? '',
    vehicleCategoryId: reservation.vehicle.vehicle_category_id,
    vehicleDescription: reservation.vehicle.make_model,
    serviceIds: reservation.services.map((service) => service.service_id),
    preferredDate: reservation.preferred_date,
    requestedStart: reservation.starts_at ?? localStart(reservation.preferred_date, '10:00'),
    workBayId: reservation.work_bay_id ?? bays.find((bay) => bay.is_active)?.id ?? null,
    status: reservation.confirmed_date ? reservation.status : 'confirmed',
    finalTotalCents: reservation.final_total_cents ?? reservation.estimated_total_cents,
    finalDurationMinutes: reservation.final_duration_minutes ?? reservation.calculated_duration_minutes,
    customerMessage: reservation.customer_message ?? '',
    internalNotes: reservation.internal_notes ?? '',
    language: reservation.language,
    source: reservation.source === 'phone' || reservation.source === 'walk_in' ? reservation.source : 'admin',
  }
}

export function ReservationModal(props: Props) {
  const [form, setForm] = useState<ReservationInput>(() => props.reservation ? fromReservation(props.reservation, props.workBays) : blank(props))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<SchedulePreview | null>(null)
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'loading' | 'ready' | 'conflict'>('idle')
  const startTimes = scheduleStartTimes('00:00', '24:00', props.startIntervalMinutes)

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') props.onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [props])

  const category = props.vehicleCategories.find((item) => item.id === form.vehicleCategoryId)
  const chosenServices = props.services.filter((service) => form.serviceIds.includes(service.id))
  const estimate = Math.round(chosenServices.reduce((sum, service) => sum + service.base_price_cents, 0) * Number(category?.price_multiplier ?? 1))
  const duration = Math.ceil(chosenServices.reduce((sum, service) => sum + service.base_duration_minutes + service.buffer_minutes, 0) * Number(category?.duration_multiplier ?? 1))
  const effectiveDuration = form.finalDurationMinutes ?? duration
  const date = form.requestedStart ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(form.requestedStart)) : form.preferredDate
  const startTime = form.requestedStart ? displayTime(form.requestedStart) : ''

  useEffect(() => {
    setPreview(null)
    if (!form.requestedStart || !form.vehicleCategoryId || !form.serviceIds.length || ['cancelled', 'expired', 'no_show'].includes(form.status)) {
      setPreviewStatus('idle'); return
    }
    const timeout = window.setTimeout(() => {
      setPreviewStatus('loading')
      previewReservation({
        reservationId: form.reservationId,
        vehicleCategoryId: form.vehicleCategoryId,
        serviceIds: form.serviceIds,
        requestedStart: form.requestedStart,
        workBayId: form.workBayId,
        finalDurationMinutes: form.finalDurationMinutes,
      }).then(({ plan }) => { setPreview(plan); setPreviewStatus('ready') })
        .catch(() => { setPreview(null); setPreviewStatus('conflict') })
    }, 220)
    return () => window.clearTimeout(timeout)
  }, [form.finalDurationMinutes, form.requestedStart, form.reservationId, form.serviceIds, form.status, form.vehicleCategoryId, form.workBayId])

  const update = <K extends keyof ReservationInput>(field: K, value: ReservationInput[K]) => { setForm((current) => ({ ...current, [field]: value })); setError('') }
  const toggleService = (id: string) => update('serviceIds', form.serviceIds.includes(id) ? form.serviceIds.filter((item) => item !== id) : [...form.serviceIds, id])
  const updateStart = (nextDate: string, nextTime: string) => update('requestedStart', nextDate && nextTime ? localStart(nextDate, nextTime) : null)

  const submit = async (event: React.FormEvent, forcedStatus?: ReservationStatus) => {
    event.preventDefault()
    const next = forcedStatus ? { ...form, status: forcedStatus } : form
    if (!next.fullName.trim() || !next.phone.trim() || !next.vehicleDescription.trim() || !next.vehicleCategoryId || !next.serviceIds.length) {
      setError('Complete the customer, vehicle and service fields.'); return
    }
    if (!['pending', 'cancelled', 'expired', 'no_show'].includes(next.status) && !next.requestedStart) {
      setError('Choose a start time.'); return
    }
    if (next.requestedStart && !['cancelled', 'expired', 'no_show'].includes(next.status) && previewStatus !== 'ready') {
      setError('Wait for a conflict-free complete work plan.'); return
    }
    setSaving(true); setError('')
    try {
      await saveReservation(next)
      props.onSaved(next.requestedStart ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Riga', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(next.requestedStart)) : next.preferredDate)
    } catch (caught) {
      setError(caught instanceof Error && caught.message === 'SLOT_CONFLICT' ? 'This bay is no longer available for the complete duration.' : 'The reservation could not be saved.')
    } finally { setSaving(false) }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="reservation-title">
    <header><div><p className="eyebrow">{props.reservation?.confirmed_date ? 'Reservation' : props.reservation ? 'Incoming request' : 'New reservation'}</p><h2 id="reservation-title">{props.reservation?.reference ?? 'Create reservation'}</h2></div><button className="icon-action" onClick={props.onClose} aria-label="Close"><X /></button></header>
    <form onSubmit={submit}>
      <div className="form-grid">
        <label>Customer name<input autoFocus maxLength={100} value={form.fullName} onChange={(event) => update('fullName', event.target.value)} required /></label>
        <label>Phone<input type="tel" inputMode="tel" maxLength={32} value={form.phone} onChange={(event) => update('phone', event.target.value)} required /></label>
        <label>Email <small>optional</small><input type="email" inputMode="email" maxLength={254} value={form.email} onChange={(event) => update('email', event.target.value)} /></label>
        <label>Vehicle make and model<input maxLength={120} value={form.vehicleDescription} onChange={(event) => update('vehicleDescription', event.target.value)} required /></label>
        <label>Vehicle type<select value={form.vehicleCategoryId} onChange={(event) => update('vehicleCategoryId', event.target.value)}>{props.vehicleCategories.map((item) => <option key={item.id} value={item.id}>{item.name_en} ×{Number(item.price_multiplier).toFixed(2)}</option>)}</select></label>
        <label>Status<select value={form.status} onChange={(event) => update('status', event.target.value as ReservationStatus)}>{['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'expired', 'no_show'].map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></label>
        <label>Source<select value={props.reservation?.source === 'public_website' ? 'public_website' : form.source} disabled={props.reservation?.source === 'public_website'} onChange={(event) => update('source', event.target.value as ReservationInput['source'])}>{props.reservation?.source === 'public_website' && <option value="public_website">Public website</option>}<option value="admin">Admin</option><option value="phone">Phone</option><option value="walk_in">Walk-in</option></select></label>
      </div>
      <fieldset className="service-picker"><legend>Selected services</legend><div>{props.services.map((service) => <label className={form.serviceIds.includes(service.id) ? 'selected' : ''} key={service.id}><input type="checkbox" checked={form.serviceIds.includes(service.id)} onChange={() => toggleService(service.id)} /><span>{form.serviceIds.includes(service.id) && <Check size={13} />}</span>{service.name_en}<small>€{(service.base_price_cents / 100).toFixed(0)} · {service.base_duration_minutes}m{service.buffer_minutes ? ` + ${service.buffer_minutes}m buffer` : ''}</small></label>)}</div></fieldset>
      <div className="form-grid schedule-fields">
        <label>Preferred date<input type="date" value={form.preferredDate} onChange={(event) => update('preferredDate', event.target.value)} required /></label>
        <label>Reservation date<input type="date" value={date} onChange={(event) => updateStart(event.target.value, startTime || '10:00')} required /></label>
        <label>Start time<select value={startTime} onChange={(event) => updateStart(date, event.target.value)}>{startTimes.map((time) => <option key={time}>{time}</option>)}</select></label>
        <label>Work bay<select value={form.workBayId ?? ''} onChange={(event) => update('workBayId', event.target.value || null)}><option value="">Automatic assignment</option>{props.workBays.filter((bay) => bay.is_active).map((bay) => <option key={bay.id} value={bay.id}>{bay.name}</option>)}</select></label>
        <label>Calculated duration<input value={`${duration} minutes (${(duration / 60).toFixed(1)} hours)`} readOnly /></label>
        <label>Final duration override (minutes)<input type="number" min={props.startIntervalMinutes} step={props.startIntervalMinutes} value={form.finalDurationMinutes ?? ''} placeholder={`${duration}`} onChange={(event) => update('finalDurationMinutes', event.target.value ? Number(event.target.value) : null)} /></label>
        <label>Completion<input value={preview ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Riga' }).format(new Date(preview.end)) : previewStatus === 'loading' ? 'Calculating…' : 'No available plan'} readOnly /></label>
        <label>Final price (€)<input type="number" inputMode="decimal" min="0" step="0.01" value={form.finalTotalCents == null ? '' : (form.finalTotalCents / 100).toFixed(2)} onChange={(event) => update('finalTotalCents', event.target.value === '' ? null : Math.round(Number(event.target.value) * 100))} /></label>
      </div>
      <div className={`availability-note ${previewStatus === 'conflict' ? 'error' : 'ok'}`}>{previewStatus === 'loading' ? 'Calculating the complete schedule…' : preview ? `Complete plan on ${props.workBays.find((bay) => bay.id === preview.workBayId)?.name ?? 'assigned bay'}.` : 'The selected start or bay cannot accommodate the complete work plan.'}<strong>{effectiveDuration} minutes · Estimate €{(estimate / 100).toFixed(2)}</strong></div>
      {preview && <section className="work-plan"><h3>Work plan</h3><ol>{preview.segments.map((segment, index) => <li key={`${segment.segment_start}-${index}`}><span>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Riga' }).format(new Date(segment.segment_start))}–{new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: 'Europe/Riga' }).format(new Date(segment.segment_end))}</span><strong>{props.workBays.find((bay) => bay.id === preview.workBayId)?.name}</strong></li>)}</ol></section>}
      <label>Customer message<textarea rows={3} maxLength={1500} value={form.customerMessage} onChange={(event) => update('customerMessage', event.target.value)} /></label>
      <label>Internal notes<textarea rows={3} maxLength={5000} value={form.internalNotes} onChange={(event) => update('internalNotes', event.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <footer>{props.reservation && !['cancelled', 'expired'].includes(props.reservation.status) && <button type="button" className="danger" onClick={(event) => void submit(event as unknown as React.FormEvent, 'cancelled')}>Cancel reservation</button>}{props.reservation && !['completed', 'cancelled', 'expired', 'no_show'].includes(props.reservation.status) && <button type="button" className="secondary" onClick={(event) => void submit(event as unknown as React.FormEvent, 'completed')}>Mark completed</button>}{props.reservation && !['cancelled', 'expired', 'no_show'].includes(props.reservation.status) && <button type="button" className="danger" onClick={async () => { if (!window.confirm('Complete this reservation and release all remaining future capacity?')) return; setSaving(true); try { await completeAndRelease(props.reservation!.id); props.onSaved(date) } catch { setError('Remaining capacity could not be released.') } finally { setSaving(false) } }}>Complete and release remaining time</button>}<span /><button type="button" className="ghost" onClick={props.onClose}>Close</button><button className="primary" disabled={saving || (Boolean(form.requestedStart) && !['cancelled', 'expired', 'no_show'].includes(form.status) && previewStatus !== 'ready')}>{saving && <LoaderCircle className="spin" size={17} />} Save reservation</button></footer>
    </form>
  </section></div>
}
