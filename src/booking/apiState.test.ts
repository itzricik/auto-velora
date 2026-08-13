import { describe, expect, it } from 'vitest'
import { apiBookingCopy } from '../i18n/apiBooking'
import { initialApiBookingState, reduceApiBookingState } from './apiState'

const slot = {
  start: '2030-01-02T07:00:00.000Z',
  end: '2030-01-02T09:00:00.000Z',
  displayTime: '09:00',
  estimatedDurationMinutes: 120,
  availableBayCount: 1,
}

describe('API booking frontend states', () => {
  it('represents loading, availability and conflict recovery', () => {
    const loading = reduceApiBookingState(initialApiBookingState, { type: 'availability_loading' })
    const ready = reduceApiBookingState(loading, {
      type: 'availability_loaded',
      slots: [slot],
      priceCents: 12000,
      durationMinutes: 120,
    })
    const conflict = reduceApiBookingState(ready, { type: 'conflict' })
    expect(loading.status).toBe('availability_loading')
    expect(ready).toMatchObject({ status: 'ready', slots: [slot], serverPriceCents: 12000 })
    expect(conflict).toEqual({ status: 'conflict', slots: [] })
  })

  it('shows only the status committed by manual or automatic mode', () => {
    const base = {
      reference: 'VEL-2030-ABCDEFGH',
      start: slot.start,
      end: slot.end,
      serverPriceCents: 12000,
      serverDurationMinutes: 120,
      message: 'Created',
      requestId: 'request-id',
    }
    const manual = reduceApiBookingState(initialApiBookingState, {
      type: 'success',
      result: { ...base, status: 'new' },
    })
    const automatic = reduceApiBookingState(initialApiBookingState, {
      type: 'success',
      result: { ...base, status: 'confirmed' },
    })
    expect(manual.status === 'success' && manual.result.status).toBe('new')
    expect(automatic.status === 'success' && automatic.result.status).toBe('confirmed')
  })

  it('contains complete live-booking states in all three languages', () => {
    for (const language of ['en', 'lv', 'ru'] as const) {
      expect(apiBookingCopy[language].loading).toBeTruthy()
      expect(apiBookingCopy[language].conflict).toBeTruthy()
      expect(apiBookingCopy[language].requested).toBeTruthy()
      expect(apiBookingCopy[language].confirmed).toBeTruthy()
    }
  })
})
