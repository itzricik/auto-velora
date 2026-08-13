import { Check, LoaderCircle, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { loadSchedule, saveReservation } from '../api'
import { buildScheduleRows, canOccupy, consecutiveIntervals, SLOT_INTERVALS } from '../schedule'
import type { Reservation, ReservationInput, ReservationStatus, ScheduleRow, Service, VehicleCategory } from '../types'

type Props = {
  reservation: Reservation | null
  selectedDate: string
  selectedStart: string | null
  services: Service[]
  vehicleCategories: VehicleCategory[]
  onClose: () => void
  onSaved: (date: string) => void
}

const blank = (date: string, start: string | null, categories: VehicleCategory[]): ReservationInput => ({
  fullName: '',
  phone: '',
  email: '',
  vehicleCategoryId: categories[0]?.id ?? '',
  vehicleDescription: '',
  serviceIds: [],
  preferredDate: date,
  confirmedDate: date,
  startTime: start,
  durationSlots: 1,
  status: 'confirmed',
  finalTotalCents: null,
  customerMessage: '',
  internalNotes: '',
  language: 'en',
})

function fromReservation(reservation: Reservation): ReservationInput {
  return {
    reservationId: reservation.id,
    fullName: reservation.customer.full_name,
    phone: reservation.customer.phone,
    email: reservation.customer.email ?? '',
    vehicleCategoryId: reservation.vehicle.vehicle_category_id,
    vehicleDescription: reservation.vehicle.make_model,
    serviceIds: reservation.services.map((service) => service.service_id),
    preferredDate: reservation.preferred_date,
    confirmedDate: reservation.confirmed_date ?? reservation.preferred_date,
    startTime: reservation.slots[0]?.start_time.slice(0, 5) ?? '10:00',
    durationSlots: Math.max(1, reservation.slots.length),
    status: reservation.confirmed_date ? reservation.status : 'confirmed',
    finalTotalCents: reservation.final_total_cents,
    customerMessage: reservation.customer_message ?? '',
    internalNotes: reservation.internal_notes ?? '',
    language: reservation.language,
  }
}

export function ReservationModal(props: Props) {
  const [form, setForm] = useState<ReservationInput>(() => props.reservation
    ? fromReservation(props.reservation)
    : blank(props.selectedDate, props.selectedStart, props.vehicleCategories))
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [loadingDate, setLoadingDate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const assignedDate = form.confirmedDate ?? form.preferredDate
  useEffect(() => {
    let active = true
    setLoadingDate(true)
    loadSchedule(assignedDate).then((result) => {
      if (active) setRows(buildScheduleRows(result.slots))
    }).catch(() => {
      if (active) setError('Availability could not be checked for this date.')
    }).finally(() => {
      if (active) setLoadingDate(false)
    })
    return () => { active = false }
  }, [assignedDate])

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') props.onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [props])

  const category = props.vehicleCategories.find((item) => item.id === form.vehicleCategoryId)
  const chosenServices = props.services.filter((service) => form.serviceIds.includes(service.id))
  const estimate = Math.round(chosenServices.reduce((sum, service) => sum + service.base_price_cents, 0) * Number(category?.price_multiplier ?? 1))
  const intervals = form.startTime ? consecutiveIntervals(form.startTime, form.durationSlots) : []
  const endTime = intervals.at(-1)?.end ?? 'â€”'
  const available = useMemo(() => form.startTime
    ? canOccupy(rows, form.startTime, form.durationSlots, form.reservationId)
    : false, [form.durationSlots, form.reservationId, form.startTime, rows])

  const update = <K extends keyof ReservationInput>(field: K, value: ReservationInput[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
    setError('')
  }

  const toggleService = (id: string) => update('serviceIds', form.serviceIds.includes(id)
    ? form.serviceIds.filter((serviceId) => serviceId !== id)
    : [...form.serviceIds, id])

  const submit = async (event: React.FormEvent, forcedStatus?: ReservationStatus) => {
    event.preventDefault()
    const next = forcedStatus ? { ...form, status: forcedStatus } : form
    if (!next.fullName.trim() || !next.phone.trim() || !next.vehicleDescription.trim() || !next.vehicleCategoryId || !next.serviceIds.length) {
      setError('Complete the customer, vehicle and service fields.')
      return
    }
    if (!['cancelled', 'no_show'].includes(next.status) && (!next.confirmedDate || !next.startTime || !available)) {
      setError('Every required consecutive interval must be available.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveReservation(next)
      props.onSaved(next.confirmedDate ?? next.preferredDate)
    } catch (caught) {
      setError(caught instanceof Error && caught.message === 'SLOT_CONFLICT'
        ? 'One of these intervals was just occupied. Choose another range.'
        : 'The reservation could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose() }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="reservation-title">
        <header><div><p className="eyebrow">{props.reservation?.confirmed_date ? 'Reservation' : props.reservation ? 'Incoming request' : 'New reservation'}</p><h2 id="reservation-title">{props.reservation?.reference ?? 'Create reservation'}</h2></div><button className="icon-action" onClick={props.onClose} aria-label="Close"><X /></button></header>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>Customer name<input autoFocus maxLength={100} value={form.fullName} onChange={(event) => update('fullName', event.target.value)} required /></label>
            <label>Phone<input type="tel" inputMode="tel" maxLength={32} value={form.phone} onChange={(event) => update('phone', event.target.value)} required /></label>
            <label>Email <small>optional</small><input type="email" inputMode="email" maxLength={254} value={form.email} onChange={(event) => update('email', event.target.value)} /></label>
            <label>Vehicle make and model<input maxLength={120} value={form.vehicleDescription} onChange={(event) => update('vehicleDescription', event.target.value)} required /></label>
            <label>Vehicle type<select value={form.vehicleCategoryId} onChange={(event) => update('vehicleCategoryId', event.target.value)}>{props.vehicleCategories.map((item) => <option key={item.id} value={item.id}>{item.name_en} Ã—{Number(item.price_multiplier).toFixed(2)}</option>)}</select></label>
            <label>Status<select value={form.status} onChange={(event) => update('status', event.target.value as ReservationStatus)}>{['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'].map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></label>
          </div>

          <fieldset className="service-picker"><legend>Selected services</legend><div>{props.services.map((service) => <label className={form.serviceIds.includes(service.id) ? 'selected' : ''} key={service.id}><input type="checkbox" checked={form.serviceIds.includes(service.id)} onChange={() => toggleService(service.id)} /><span>{form.serviceIds.includes(service.id) && <Check size={13} />}</span>{service.name_en}<small>â‚¬{(service.base_price_cents / 100).toFixed(0)}</small></label>)}</div></fieldset>

          <div className="form-grid schedule-fields">
            <label>Preferred date<input type="date" value={form.preferredDate} onChange={(event) => update('preferredDate', event.target.value)} required /></label>
            <label>Reservation date<input type="date" value={assignedDate} onChange={(event) => update('confirmedDate', event.target.value)} required /></label>
            <label>Start time<select value={form.startTime ?? ''} onChange={(event) => update('startTime', event.target.value)}>{SLOT_INTERVALS.map((slot) => <option key={slot.start}>{slot.start}</option>)}</select></label>
            <label>Duration<select value={form.durationSlots} onChange={(event) => update('durationSlots', Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value * 2} hours Â· {value} interval{value > 1 ? 's' : ''}</option>)}</select></label>
            <label>End time<input value={endTime} readOnly /></label>
            <label>Final price (â‚¬)<input type="number" inputMode="decimal" min="0" step="0.01" value={form.finalTotalCents == null ? '' : (form.finalTotalCents / 100).toFixed(2)} onChange={(event) => update('finalTotalCents', event.target.value === '' ? null : Math.round(Number(event.target.value) * 100))} /></label>
          </div>

          <div className={`availability-note ${available ? 'ok' : ''}`}>{loadingDate ? <><LoaderCircle className="spin" size={16} /> Checking intervalsâ€¦</> : available ? 'All selected intervals are available.' : 'This range is not fully available.'}<strong>Server estimate â‚¬{(estimate / 100).toFixed(2)}</strong></div>
          <label>Customer message<textarea rows={3} maxLength={1500} value={form.customerMessage} onChange={(event) => update('customerMessage', event.target.value)} /></label>
          <label>Internal notes<textarea rows={3} maxLength={5000} value={form.internalNotes} onChange={(event) => update('internalNotes', event.target.value)} /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <footer>
            {props.reservation && props.reservation.status !== 'cancelled' && <button type="button" className="danger" onClick={(event) => void submit(event as unknown as React.FormEvent, 'cancelled')}>Cancel reservation</button>}
            {props.reservation && props.reservation.status !== 'completed' && props.reservation.status !== 'cancelled' && <button type="button" className="secondary" onClick={(event) => void submit(event as unknown as React.FormEvent, 'completed')}>Mark completed</button>}
            <span />
            <button type="button" className="ghost" onClick={props.onClose}>Close</button>
            <button className="primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={17} />} Save reservation</button>
          </footer>
        </form>
      </section>
    </div>
  )
}
