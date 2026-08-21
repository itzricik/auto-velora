export type PricingService = {
  id: string
  code: string
  name: string
  basePriceCents: number
  baseDurationMinutes: number
  bufferMinutes?: number
}

export type PricingVehicle = {
  id: string
  code: string
  name: string
  priceMultiplier: number
  durationMultiplier: number
}

export type PricingPackage = {
  id: string
  code: string
  name: string
  packagePriceCents: number
  baseDurationMinutes: number
  bufferMinutes?: number
  services: PricingService[]
}

export type ServerEstimate = {
  priceCents: number
  durationMinutes: number
  services: PricingService[]
  itemPricesCents: Record<string, number>
}

export function calculateServerEstimate(input: {
  services: PricingService[]
  vehicle: PricingVehicle
  package?: PricingPackage
}): ServerEstimate {
  const selected = input.package?.services ?? input.services
  if (!selected.length) throw new Error('NO_SERVICES')
  const unique = [...new Map(selected.map((service) => [service.id, service])).values()]
  if (unique.some((service) => service.basePriceCents < 0 || service.baseDurationMinutes <= 0 || (service.bufferMinutes ?? 0) < 0)) {
    throw new Error('INVALID_CATALOG')
  }

  const basePrice = input.package?.packagePriceCents
    ?? unique.reduce((total, service) => total + service.basePriceCents, 0)
  const baseDuration = input.package
    ? input.package.baseDurationMinutes + (input.package.bufferMinutes ?? 0)
    : unique.reduce((total, service) => total + service.baseDurationMinutes + (service.bufferMinutes ?? 0), 0)

  let itemPricesCents: Record<string, number>
  let priceCents: number
  if (input.package) {
    priceCents = Math.round(basePrice * input.vehicle.priceMultiplier)
    let allocated = 0
    const servicePriceTotal = unique.reduce((sum, item) => sum + item.basePriceCents, 0)
    itemPricesCents = Object.fromEntries(unique.map((service, index) => {
      const price = index === unique.length - 1
        ? priceCents - allocated
        : servicePriceTotal === 0 ? 0 : Math.round(priceCents * service.basePriceCents / servicePriceTotal)
      allocated += price
      return [service.id, price]
    }))
  } else {
    itemPricesCents = Object.fromEntries(unique.map((service) => [
      service.id,
      Math.round(service.basePriceCents * input.vehicle.priceMultiplier),
    ]))
    priceCents = Object.values(itemPricesCents).reduce((total, price) => total + price, 0)
  }

  return {
    priceCents,
    durationMinutes: Math.ceil(baseDuration * input.vehicle.durationMultiplier),
    services: unique,
    itemPricesCents,
  }
}
