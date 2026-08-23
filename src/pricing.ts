import { siteConfig } from './config/site'
import type { PublicCatalog } from './shared/publicCatalog'

// These identifiers only control presentation and translations. All monetary,
// duration, multiplier and package-composition values come from Supabase.
export const services = [
  { id: 'exterior', estimatorOnly: false },
  { id: 'interior', estimatorOnly: false },
  { id: 'correction', estimatorOnly: false },
  { id: 'ceramic', estimatorOnly: false },
  { id: 'ppfFront', estimatorOnly: false },
  { id: 'ppfFull', estimatorOnly: true },
  { id: 'maintenance', estimatorOnly: false },
] as const

export type ServiceId = (typeof services)[number]['id']
export const serviceIds = services.map((service) => service.id) as ServiceId[]
export const serviceCards = services.filter((service) => !service.estimatorOnly)

export const vehicleTypes = [
  { id: 'compact' },
  { id: 'sedan' },
  { id: 'suv' },
  { id: 'large' },
] as const

export type VehicleId = (typeof vehicleTypes)[number]['id']

export const packages = [
  { id: 'essential', featured: false },
  { id: 'restore', featured: true },
  { id: 'protect', featured: false },
] as const

export type PackageId = (typeof packages)[number]['id']

export type PackagePriceEstimate = {
  packageId: PackageId
  vehicleId: VehicleId
  multiplier: number
  baseTotal: number
  estimatedTotal: number
  serviceIds: ServiceId[]
}

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

export function calculateEstimate(
  selectedIds: readonly ServiceId[],
  vehicleId: VehicleId,
  catalog: PublicCatalog | null,
): PriceEstimate {
  const uniqueIds = [...new Set(selectedIds)].filter(isServiceId)
  const vehicle = catalog?.vehicleCategories.find((item) => item.code === vehicleId)
  const multiplier = Number(vehicle?.price_multiplier ?? 0)
  const durationMultiplier = Number(vehicle?.duration_multiplier ?? 0)
  const selectedServices = catalog?.services.filter((service) => uniqueIds.includes(service.code as ServiceId)) ?? []
  const baseTotalCents = selectedServices.reduce((total, service) => total + service.base_price_cents, 0)
  const baseMinutes = selectedServices.reduce((total, service) => total + service.base_duration_minutes + service.buffer_minutes, 0)

  return {
    serviceIds: uniqueIds,
    vehicleId,
    multiplier,
    baseTotal: baseTotalCents / 100,
    estimatedTotal: Math.round(baseTotalCents * multiplier) / 100,
    estimatedHours: Math.round(baseMinutes * durationMultiplier / 30) / 2,
    pricingVersion: siteConfig.pricingVersion,
  }
}

export function calculatePackagePrice(
  packageId: PackageId,
  vehicleId: VehicleId,
  catalog: PublicCatalog | null,
): PackagePriceEstimate {
  const selectedPackage = catalog?.packages.find((item) => item.code === packageId)
  const vehicle = catalog?.vehicleCategories.find((item) => item.code === vehicleId)
  const multiplier = Number(vehicle?.price_multiplier ?? 0)
  const baseTotal = (selectedPackage?.package_price_cents ?? 0) / 100
  const serviceIdsForPackage = selectedPackage?.service_ids
    .map((id) => catalog?.services.find((service) => service.id === id)?.code)
    .filter((code): code is ServiceId => Boolean(code && isServiceId(code))) ?? []

  return {
    packageId,
    vehicleId,
    multiplier,
    baseTotal,
    estimatedTotal: Math.round((selectedPackage?.package_price_cents ?? 0) * multiplier) / 100,
    serviceIds: serviceIdsForPackage,
  }
}

export function getPackageConsistencyIssues(catalog: PublicCatalog | null): string[] {
  if (!catalog) return ['catalog: unavailable']
  return packages.flatMap((item) => {
    const packageValue = calculatePackagePrice(item.id, 'compact', catalog)
    const includedServicesTotal = calculateEstimate(packageValue.serviceIds, 'compact', catalog).baseTotal
    if (packageValue.baseTotal <= 0) return [`${item.id}: package price must be positive`]
    if (packageValue.baseTotal > includedServicesTotal) {
      return [`${item.id}: package price exceeds the sum of its included base services`]
    }
    return []
  })
}
