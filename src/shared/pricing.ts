export type PricingService = {
  id: string
  code: string
  name: string
  basePriceCents: number
  baseDurationMinutes: number
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
  packagePriceCents: number
  baseDurationMinutes: number
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
  if (unique.some((service) => service.basePriceCents < 0 || service.baseDurationMinutes <= 0)) {
    throw new Error('INVALID_CATALOG')
  }

  const basePrice = input.package?.packagePriceCents
    ?? unique.reduce((total, service) => total + service.basePriceCents, 0)
  const baseDuration = input.package?.baseDurationMinutes
    ?? unique.reduce((total, service) => total + service.baseDurationMinutes, 0)

  let itemPricesCents: Record<string, number>
  let priceCents: number
  if (input.package) {
    priceCents = Math.round(basePrice * input.vehicle.priceMultiplier)
    let allocated = 0
    itemPricesCents = Object.fromEntries(unique.map((service, index) => {
      const price = index === unique.length - 1
        ? priceCents - allocated
        : Math.round(priceCents * service.basePriceCents / unique.reduce((sum, item) => sum + item.basePriceCents, 0))
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
    durationMinutes: Math.ceil(baseDuration * input.vehicle.durationMultiplier / 30) * 30,
    services: unique,
    itemPricesCents,
  }
}
