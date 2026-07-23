import { siteConfig } from '../config/site'
import { calculateEstimate, services, vehicleTypes, type ServiceId, type VehicleId } from '../pricing'
import type { Language } from '../i18n/translations'

export type BookingPayloadInput = {
  requestReference: string
  name: string
  normalizedPhone: string
  email: string
  vehicle: string
  serviceIds: ServiceId[]
  serviceNames: string[]
  vehicleId: VehicleId
  selectedDate: string
  language: Language
  message: string
  consentTimestamp: string
}

function appendOptional(payload: URLSearchParams, fieldId: string | null, value: string) {
  if (fieldId) payload.set(fieldId, value)
}

export function buildGoogleFormsPayload(input: BookingPayloadInput): URLSearchParams {
  const fields = siteConfig.googleForms.fields
  const optional = siteConfig.googleForms.optionalFields
  const estimate = calculateEstimate(input.serviceIds, input.vehicleId)
  const vehicle = vehicleTypes.find((item) => item.id === input.vehicleId)
  const selectedServices = services.filter((service) => input.serviceIds.includes(service.id))
  const [year, month, day] = input.selectedDate.split('-')
  const duration = `${estimate.estimatedHours} hours (client-side estimate)`
  const price = `€${estimate.estimatedTotal} (client-side estimate; non-authoritative)`
  const structuredDetails = [
    `Request reference: ${input.requestReference}`,
    `Customer: ${input.name}`,
    `Normalized phone: ${input.normalizedPhone}`,
    `Email: ${input.email}`,
    `Vehicle: ${input.vehicle}`,
    `Service IDs: ${input.serviceIds.join(', ')}`,
    `Service names: ${input.serviceNames.join(', ')}`,
    `Vehicle category: ${input.vehicleId}`,
    `Vehicle multiplier: ${vehicle?.multiplier ?? estimate.multiplier}`,
    `Estimated price: ${price}`,
    `Estimated duration: ${duration}`,
    `Pricing version: ${siteConfig.pricingVersion}`,
    `Preferred date: ${input.selectedDate}`,
    `Language: ${input.language}`,
    `Consent timestamp: ${input.consentTimestamp}`,
    `Consent policy version: ${siteConfig.consentPolicyVersion}`,
    `Customer message: ${input.message || '(none)'}`,
  ].join('\n')

  const payload = new URLSearchParams({
    [fields.name]: input.name,
    [fields.phone]: input.normalizedPhone,
    [fields.email]: input.email,
    [fields.vehicle]: input.vehicle,
    [fields.services]: input.serviceNames.join(', '),
    [fields.message]: structuredDetails,
    [fields.consent]: `Yes — ${input.consentTimestamp} — policy ${siteConfig.consentPolicyVersion}`,
    [fields.language]: input.language.toUpperCase(),
    [fields.dateYear]: year,
    [fields.dateMonth]: month,
    [fields.dateDay]: day,
  })

  appendOptional(payload, optional.requestReference, input.requestReference)
  appendOptional(payload, optional.serviceIds, input.serviceIds.join(', '))
  appendOptional(payload, optional.vehicleCategory, input.vehicleId)
  appendOptional(payload, optional.vehicleMultiplier, String(estimate.multiplier))
  appendOptional(payload, optional.estimatedPrice, price)
  appendOptional(payload, optional.estimatedDuration, duration)
  appendOptional(payload, optional.pricingVersion, siteConfig.pricingVersion)
  appendOptional(payload, optional.consentTimestamp, input.consentTimestamp)
  appendOptional(payload, optional.consentPolicyVersion, siteConfig.consentPolicyVersion)

  if (!selectedServices.length) throw new Error('Cannot build a booking payload without known services.')
  return payload
}
