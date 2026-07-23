import { siteConfig } from './config/site'

export const services = [
  { id: 'exterior', price: 45, hours: 2, cardDuration: '1.5–2 h', estimatorOnly: false },
  { id: 'interior', price: 120, hours: 5, cardDuration: '4–6 h', estimatorOnly: false },
  { id: 'correction', price: 220, hours: 8, cardDuration: '6–10 h', estimatorOnly: false },
  { id: 'ceramic', price: 450, hours: 14, cardDuration: '1–2 days', estimatorOnly: false },
  { id: 'ppfFront', price: 900, hours: 16, cardDuration: '1–2 days', estimatorOnly: false },
  { id: 'ppfFull', price: 2500, hours: 40, cardDuration: '3–5 days', estimatorOnly: true },
  { id: 'maintenance', price: 75, hours: 2.5, cardDuration: '2–3 h', estimatorOnly: false },
] as const

export type ServiceId = (typeof services)[number]['id']

export const serviceIds = services.map((service) => service.id) as ServiceId[]
export const serviceCards = services.filter((service) => !service.estimatorOnly)

export const vehicleTypes = [
  { id: 'compact', multiplier: 1 },
  { id: 'sedan', multiplier: 1.1 },
  { id: 'suv', multiplier: 1.25 },
  { id: 'large', multiplier: 1.4 },
] as const

export type VehicleId = (typeof vehicleTypes)[number]['id']

export const packages = [
  { id: 'essential', price: 89, featured: false, serviceIds: ['exterior', 'maintenance'] },
  { id: 'restore', price: 279, featured: true, serviceIds: ['exterior', 'interior', 'correction'] },
  { id: 'protect', price: 549, featured: false, serviceIds: ['correction', 'ceramic'] },
] as const satisfies ReadonlyArray<{
  id: string
  price: number
  featured: boolean
  serviceIds: readonly ServiceId[]
}>

export type PackageId = (typeof packages)[number]['id']

export type PriceEstimate = {
  serviceIds: ServiceId[]
  vehicleId: VehicleId
  multiplier: number
  baseTotal: number
  estimatedTotal: number
  estimatedHours: number
  pricingVersion: string
}

export function isServiceId(value: string): value is ServiceId {
  return serviceIds.includes(value as ServiceId)
}

export function isVehicleId(value: string): value is VehicleId {
  return vehicleTypes.some((vehicle) => vehicle.id === value)
}

export function calculateEstimate(selectedIds: readonly ServiceId[], vehicleId: VehicleId): PriceEstimate {
  const uniqueIds = [...new Set(selectedIds)].filter(isServiceId)
  const multiplier = vehicleTypes.find((vehicle) => vehicle.id === vehicleId)?.multiplier ?? 1
  const selectedServices = services.filter((service) => uniqueIds.includes(service.id))
  const baseTotal = selectedServices.reduce((total, service) => total + service.price, 0)
  const baseHours = selectedServices.reduce((total, service) => total + service.hours, 0)

  return {
    serviceIds: uniqueIds,
    vehicleId,
    multiplier,
    baseTotal,
    estimatedTotal: Math.round(baseTotal * multiplier),
    estimatedHours: Math.round(baseHours * multiplier * 2) / 2,
    pricingVersion: siteConfig.pricingVersion,
  }
}

export function getPackageConsistencyIssues(): string[] {
  return packages.flatMap((item) => {
    const includedServicesTotal = calculateEstimate(item.serviceIds, 'compact').baseTotal
    if (item.price <= 0) return [`${item.id}: package price must be positive`]
    if (item.price > includedServicesTotal) {
      return [`${item.id}: package price exceeds the sum of its included base services`]
    }
    return []
  })
}
