export type PricingService = {
  id: string
  code: string
  name: string
  basePriceCents: number
  baseDurationMinutes: number
}

export type PricingVehicle = {
  id: string
  priceMultiplier: number
  durationMultiplier: number
}

export type PricingPackage = {
  id: string
  packagePriceCents: number
  baseDurationMinutes: number
  services: PricingService[]
}

export type ServerEstimate = {
  priceCents: number
  durationMinutes: number
  services: PricingService[]
}

export function calculateServerEstimate(input: {
  services: PricingService[]
  vehicle: PricingVehicle
  package?: PricingPackage
}): ServerEstimate {
  const selected = input.package?.services ?? input.services
  if (!selected.length) throw new Error('NO_SERVICES')
  const unique = [...new Map(selected.map((service) => [service.id, service])).values()]
  if (unique.some((service) => service.basePriceCents < 0 || service.baseDurationMinutes <= 0)) {
    throw new Error('INVALID_CATALOG')
  }

  const basePrice = input.package?.packagePriceCents
    ?? unique.reduce((total, service) => total + service.basePriceCents, 0)
  const baseDuration = input.package?.baseDurationMinutes
    ?? unique.reduce((total, service) => total + service.baseDurationMinutes, 0)

  return {
    priceCents: Math.round(basePrice * input.vehicle.priceMultiplier),
    durationMinutes: Math.ceil(baseDuration * input.vehicle.durationMultiplier / 30) * 30,
    services: unique,
  }
}
