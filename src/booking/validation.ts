import { isServiceId, type ServiceId } from '../pricing'

export const BOOKING_LIMITS = {
  name: 100,
  email: 254,
  phone: 32,
  vehicle: 120,
  message: 1500,
} as const

export type BookingFormValues = {
  name: string
  phone: string
  email: string
  vehicle: string
  serviceIds: string[]
  date: string
  message: string
  consent: boolean
}

export type BookingField = keyof BookingFormValues
export type BookingErrorCode =
  | 'name'
  | 'nameTooLong'
  | 'phone'
  | 'phoneTooLong'
  | 'email'
  | 'emailTooLong'
  | 'vehicle'
  | 'vehicleTooLong'
  | 'services'
  | 'unknownService'
  | 'date'
  | 'messageTooLong'
  | 'consent'

export type BookingValidationErrors = Partial<Record<BookingField, BookingErrorCode>>

export function normalizePhone(value: string): string {
  const trimmed = value.trim()
  const international = trimmed.startsWith('+') || trimmed.startsWith('00')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  return international ? `+${digits.replace(/^00/, '')}` : digits
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function getLocalDate(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function isPastDate(value: string, today = getLocalDate()): boolean {
  return Boolean(value) && value < today
}

export function sanitizeBookingValues(values: BookingFormValues): Omit<BookingFormValues, 'serviceIds'> & { serviceIds: ServiceId[] } {
  return {
    ...values,
    name: values.name.trim(),
    phone: normalizePhone(values.phone),
    email: values.email.trim().toLowerCase(),
    vehicle: values.vehicle.trim(),
    message: values.message.trim(),
    serviceIds: [...new Set(values.serviceIds.filter(isServiceId))],
  }
}

export function validateBooking(values: BookingFormValues, today = getLocalDate()): BookingValidationErrors {
  const errors: BookingValidationErrors = {}
  const name = values.name.trim()
  const phone = normalizePhone(values.phone)
  const vehicle = values.vehicle.trim()
  const unknownServices = values.serviceIds.filter((id) => !isServiceId(id))

  if (name.length < 2) errors.name = 'name'
  else if (name.length > BOOKING_LIMITS.name) errors.name = 'nameTooLong'

  if (phone.replace(/\D/g, '').length < 8) errors.phone = 'phone'
  else if (values.phone.length > BOOKING_LIMITS.phone) errors.phone = 'phoneTooLong'

  if (values.email.length > BOOKING_LIMITS.email) errors.email = 'emailTooLong'
  else if (!isValidEmail(values.email)) errors.email = 'email'

  if (vehicle.length < 2) errors.vehicle = 'vehicle'
  else if (vehicle.length > BOOKING_LIMITS.vehicle) errors.vehicle = 'vehicleTooLong'

  if (!values.serviceIds.length) errors.serviceIds = 'services'
  else if (unknownServices.length) errors.serviceIds = 'unknownService'

  if (!values.date || isPastDate(values.date, today)) errors.date = 'date'
  if (values.message.length > BOOKING_LIMITS.message) errors.message = 'messageTooLong'
  if (!values.consent) errors.consent = 'consent'

  return errors
}

export function buildSubmissionFingerprint(values: BookingFormValues): string {
  const clean = sanitizeBookingValues(values)
  return JSON.stringify({ ...clean, serviceIds: [...clean.serviceIds].sort() })
}

export function isDuplicateSubmission(fingerprint: string, lastFingerprint: string, isSubmitting: boolean): boolean {
  return isSubmitting || Boolean(lastFingerprint && fingerprint === lastFingerprint)
}
