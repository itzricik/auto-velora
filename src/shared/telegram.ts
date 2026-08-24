import type { BookingLanguage, BookingStatus } from './contracts'

export type TelegramIdentity = {
  userId: string
  username?: string
  firstName: string
  lastName?: string
  languageCode?: string
  photoUrl?: string
  allowsWriteToPm: boolean
  authDate: number
  startParam?: string
}

export type TelegramVehicle = {
  id: string
  makeModel: string
  vehicleCategoryId: string
  vehicleType: string
  registrationNumber?: string
}

export type TelegramBooking = {
  id: string
  reference: string
  status: BookingStatus | 'pending' | 'expired'
  start?: string
  end?: string
  estimatedPriceMinCents: number
  estimatedPriceMaxCents: number
  vehicleId: string
  vehicle: string
  serviceIds: string[]
  services: string[]
}

export type TelegramProfile = {
  userId: string
  firstName: string
  lastName?: string
  username?: string
  language: BookingLanguage
  photoUrl?: string
  allowsWriteToPm: boolean
  linked: boolean
  customer?: {
    fullName: string
    phone: string
    email?: string
  }
  vehicles: TelegramVehicle[]
  bookings: TelegramBooking[]
}

export type TelegramAuthResponse = {
  sessionToken: string
  expiresAt: string
  profile: TelegramProfile
  startParam?: string
}

export type TelegramView = 'home' | 'services' | 'book' | 'bookings' | 'profile'

export type TelegramStartTarget = {
  view: TelegramView
  serviceCode?: string
}

export function telegramLanguage(value?: string): BookingLanguage {
  const normalized = value?.toLowerCase() ?? ''
  if (normalized.startsWith('lv')) return 'lv'
  if (normalized.startsWith('ru')) return 'ru'
  return 'en'
}

export function parseTelegramStartParam(value: unknown, serviceCodes: readonly string[] = []): TelegramStartTarget {
  if (typeof value !== 'string' || value.length > 128 || !/^[a-zA-Z0-9_-]*$/.test(value)) return { view: 'home' }
  if (value === 'book') return { view: 'book' }
  if (value === 'services') return { view: 'services' }
  if (value === 'mybookings') return { view: 'bookings' }
  if (value === 'profile') return { view: 'profile' }
  if (value.startsWith('service_')) {
    const serviceCode = value.slice('service_'.length)
    if (serviceCodes.includes(serviceCode)) return { view: 'book', serviceCode }
  }
  return { view: 'home' }
}
