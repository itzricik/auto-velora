import { afterEach, describe, expect, it, vi } from 'vitest'
import { siteConfig } from '../config/site'
import { translations } from '../i18n/translations'
import { buildGoogleFormsPayload } from './payload'
import { isRequestReference } from './reference'
import {
  submitBookingRequest,
  type BookingSubmissionInput,
} from './submission'

const submissionInput: BookingSubmissionInput = {
  name: 'Anna Berzina',
  normalizedPhone: '+37120123456',
  email: 'anna@example.lv',
  vehicle: 'Volvo XC60',
  serviceIds: ['exterior', 'interior'],
  serviceNames: ['Signature Exterior', 'Interior Reset'],
  vehicleId: 'sedan',
  selectedDate: '2030-01-02',
  language: 'en',
  message: 'Light swirl marks',
  consentTimestamp: '2026-07-23T09:00:00.000Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('booking submission modes', () => {
  it('runs the demo without fetch, Google Forms transport or browser persistence', async () => {
    const fetchSpy = vi.fn()
    const googleFormsTransport = vi.fn()
    const localStorageWrite = vi.fn()
    const sessionStorageWrite = vi.fn()
    const cookieWrite = vi.fn()
    const fakeDocument = {}

    Object.defineProperty(fakeDocument, 'cookie', { set: cookieWrite })
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('localStorage', { setItem: localStorageWrite })
    vi.stubGlobal('sessionStorage', { setItem: sessionStorageWrite })
    vi.stubGlobal('document', fakeDocument)

    const result = await submitBookingRequest('demo', submissionInput, { googleFormsTransport })

    expect(result.mode).toBe('demo')
    expect(isRequestReference(result.summary.requestReference)).toBe(true)
    expect(result.summary).toMatchObject({
      serviceIds: ['exterior', 'interior'],
      selectedDate: '2030-01-02',
      estimatedPrice: 182,
      estimatedHours: 8,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(googleFormsTransport).not.toHaveBeenCalled()
    expect(localStorageWrite).not.toHaveBeenCalled()
    expect(sessionStorageWrite).not.toHaveBeenCalled()
    expect(cookieWrite).not.toHaveBeenCalled()
  })

  it('can build the Google Forms payload only when that mode is explicitly enabled', async () => {
    let payload: URLSearchParams | undefined
    const googleFormsTransport = vi.fn(async (input) => {
      payload = buildGoogleFormsPayload(input)
    })

    const result = await submitBookingRequest('googleForms', submissionInput, {
      generateReference: () => 'VEL-2026-ABCDEFGH',
      googleFormsTransport,
    })

    expect(result.mode).toBe('googleForms')
    expect(googleFormsTransport).toHaveBeenCalledOnce()
    expect(payload?.get(siteConfig.googleForms.fields.name)).toBe('Anna Berzina')
    expect(payload?.get(siteConfig.googleForms.fields.message)).toContain('VEL-2026-ABCDEFGH')
  })

  it('provides an explicit demo warning in every language', () => {
    expect(translations.en.booking.demoWarning).toBe('Portfolio demo. Information entered here is not sent or stored.')
    expect(translations.lv.booking.demoWarning).toBe('Portfolio demonstrācija. Šeit ievadītā informācija netiek nosūtīta vai saglabāta.')
    expect(translations.ru.booking.demoWarning).toBe('Демонстрация для портфолио. Введённые данные не отправляются и не сохраняются.')
  })

  it('never presents the demo completion as a real reservation', () => {
    const successCopy = [
      translations.en.booking.demoSuccess,
      translations.lv.booking.demoSuccess,
      translations.ru.booking.demoSuccess,
    ].join(' ')

    expect(successCopy).not.toMatch(/confirmed|received|apstiprināta|saņemta|подтверждена|получена/i)
    expect(translations.en.booking.demoNoReservation).toBe('No real reservation was created.')
    expect(translations.lv.booking.demoNoReservation).toBe('Īsta rezervācija netika izveidota.')
    expect(translations.ru.booking.demoNoReservation).toBe('Реальная запись не создавалась.')
  })
})
