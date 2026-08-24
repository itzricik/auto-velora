import { describe, expect, it } from 'vitest'
import { parseTelegramStartParam, telegramLanguage } from './telegram'

describe('Telegram deep links', () => {
  it('allows known destinations and verified service codes only', () => {
    expect(parseTelegramStartParam('mybookings')).toEqual({ view: 'bookings' })
    expect(parseTelegramStartParam('service_ceramic', ['ceramic'])).toEqual({ view: 'book', serviceCode: 'ceramic' })
    expect(parseTelegramStartParam('service_unknown', ['ceramic'])).toEqual({ view: 'home' })
    expect(parseTelegramStartParam('../profile')).toEqual({ view: 'home' })
  })

  it('uses only supported interface languages', () => {
    expect(telegramLanguage('lv-LV')).toBe('lv')
    expect(telegramLanguage('ru')).toBe('ru')
    expect(telegramLanguage('de')).toBe('en')
  })
})
