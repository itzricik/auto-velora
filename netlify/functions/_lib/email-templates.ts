import type { BookingLanguage, BookingStatus } from '../../../src/shared/contracts'

export type BookingEmailModel = {
  reference: string
  status: BookingStatus
  start: string
  end: string
  services: string[]
  vehicle: string
  estimatedPriceCents: number
  managementUrl: string
  language: BookingLanguage
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const copy = {
  en: {
    subject: 'VELORA booking {reference}: {status}',
    heading: 'Booking update',
    date: 'Date and time',
    services: 'Services',
    vehicle: 'Vehicle',
    estimate: 'Estimated price',
    status: 'Status',
    manage: 'View or manage booking',
  },
  lv: {
    subject: 'VELORA vizīte {reference}: {status}',
    heading: 'Vizītes informācija',
    date: 'Datums un laiks',
    services: 'Pakalpojumi',
    vehicle: 'Auto',
    estimate: 'Paredzamā cena',
    status: 'Statuss',
    manage: 'Skatīt vai pārvaldīt vizīti',
  },
  ru: {
    subject: 'Запись VELORA {reference}: {status}',
    heading: 'Информация о записи',
    date: 'Дата и время',
    services: 'Услуги',
    vehicle: 'Автомобиль',
    estimate: 'Ориентировочная цена',
    status: 'Статус',
    manage: 'Просмотреть или изменить запись',
  },
} as const

export function renderBookingEmail(model: BookingEmailModel): { subject: string; html: string; text: string } {
  const language = copy[model.language]
  const date = new Intl.DateTimeFormat(model.language === 'en' ? 'en-LV' : `${model.language}-LV`, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Riga',
  }).format(new Date(model.start))
  const price = new Intl.NumberFormat(model.language === 'en' ? 'en-LV' : `${model.language}-LV`, {
    style: 'currency',
    currency: 'EUR',
  }).format(model.estimatedPriceCents / 100)
  const subject = language.subject
    .replace('{reference}', model.reference)
    .replace('{status}', model.status)
  const rows = [
    [language.date, date],
    [language.services, model.services.join(', ')],
    [language.vehicle, model.vehicle],
    [language.estimate, price],
    [language.status, model.status],
  ]
  const text = [
    language.heading,
    model.reference,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    `${language.manage}: ${model.managementUrl}`,
  ].join('\n')
  const html = `
    <main style="font-family:Arial,sans-serif;color:#111318">
      <h1>${escapeHtml(language.heading)}</h1>
      <p><strong>${escapeHtml(model.reference)}</strong></p>
      <dl>${rows.map(([label, value]) => `<dt><strong>${escapeHtml(label)}</strong></dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl>
      <p><a href="${escapeHtml(model.managementUrl)}">${escapeHtml(language.manage)}</a></p>
    </main>
  `.trim()
  return { subject, html, text }
}

export function renderOwnerEmail(model: BookingEmailModel): { subject: string; html: string; text: string } {
  const customer = renderBookingEmail({ ...model, language: 'en' })
  return {
    ...customer,
    subject: `VELORA owner notice: ${model.reference} — ${model.status}`,
  }
}
