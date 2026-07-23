import { describe, expect, it } from 'vitest'
import {
  BOOKING_LIMITS,
  buildSubmissionFingerprint,
  isDuplicateSubmission,
  isPastDate,
  isValidEmail,
  normalizePhone,
  sanitizeBookingValues,
  validateBooking,
  type BookingFormValues,
} from './validation'

const validValues: BookingFormValues = {
  name: '  Anna Berzina  ',
  phone: ' +371 20 123 456 ',
  email: ' ANNA@EXAMPLE.LV ',
  vehicle: '  Volvo XC60 ',
  serviceIds: ['exterior'],
  date: '2030-01-02',
  message: '  Light swirl marks  ',
  consent: true,
}

describe('booking validation', () => {
  it('normalizes phone values and trimmed fields', () => {
    expect(normalizePhone(' +371 (20) 123-456 ')).toBe('+37120123456')
    expect(normalizePhone('00371 20 123 456')).toBe('+37120123456')
    expect(sanitizeBookingValues(validValues)).toMatchObject({
      name: 'Anna Berzina',
      phone: '+37120123456',
      email: 'anna@example.lv',
      vehicle: 'Volvo XC60',
      message: 'Light swirl marks',
    })
  })

  it('validates email syntax', () => {
    expect(isValidEmail('person@example.lv')).toBe(true)
    expect(isValidEmail('person@invalid')).toBe(false)
  })

  it('rejects past dates but accepts today', () => {
    expect(isPastDate('2029-12-31', '2030-01-01')).toBe(true)
    expect(isPastDate('2030-01-01', '2030-01-01')).toBe(false)
  })

  it('rejects empty and unknown service selections', () => {
    expect(validateBooking({ ...validValues, serviceIds: [] }, '2029-01-01').serviceIds).toBe('services')
    expect(validateBooking({ ...validValues, serviceIds: ['unknown'] }, '2029-01-01').serviceIds).toBe('unknownService')
  })

  it('enforces maximum lengths', () => {
    const errors = validateBooking({
      ...validValues,
      name: 'n'.repeat(BOOKING_LIMITS.name + 1),
      email: `${'a'.repeat(BOOKING_LIMITS.email)}@x.lv`,
      phone: '1'.repeat(BOOKING_LIMITS.phone + 1),
      vehicle: 'v'.repeat(BOOKING_LIMITS.vehicle + 1),
      message: 'm'.repeat(BOOKING_LIMITS.message + 1),
    }, '2029-01-01')

    expect(errors).toMatchObject({
      name: 'nameTooLong',
      email: 'emailTooLong',
      phone: 'phoneTooLong',
      vehicle: 'vehicleTooLong',
      message: 'messageTooLong',
    })
  })

  it('detects duplicate and in-flight submissions', () => {
    const fingerprint = buildSubmissionFingerprint(validValues)
    expect(isDuplicateSubmission(fingerprint, '', false)).toBe(false)
    expect(isDuplicateSubmission(fingerprint, fingerprint, false)).toBe(true)
    expect(isDuplicateSubmission(fingerprint, '', true)).toBe(true)
  })
})
