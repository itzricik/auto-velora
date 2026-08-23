import { describe, expect, it } from 'vitest'
import {
  calculateEstimate,
  calculatePackagePrice,
  getPackageConsistencyIssues,
} from './pricing'
import { publicCatalogFixture } from '../tests/fixtures/publicCatalog'

describe('pricing', () => {
  it('calculates compact and SUV estimates from the same base prices', () => {
    expect(calculateEstimate(['exterior', 'interior'], 'compact', publicCatalogFixture)).toMatchObject({
      baseTotal: 165,
      estimatedTotal: 165,
      multiplier: 1,
      estimatedHours: 7,
    })
    expect(calculateEstimate(['exterior', 'interior'], 'suv', publicCatalogFixture)).toMatchObject({
      baseTotal: 165,
      estimatedTotal: 206.25,
      multiplier: 1.25,
      estimatedHours: 9,
    })
  })

  it('uses the documented vehicle multipliers', () => {
    expect(publicCatalogFixture.vehicleCategories.map(({ code, price_multiplier }) => [code, price_multiplier])).toEqual([
      ['compact', 1],
      ['sedan', 1.1],
      ['suv', 1.25],
      ['large', 1.4],
    ])
  })

  it('keeps package prices positive and below their included base services', () => {
    expect(publicCatalogFixture.packages.map((item) => item.package_price_cents)).toEqual([8900, 27900, 54900])
    expect(getPackageConsistencyIssues(publicCatalogFixture)).toEqual([])
  })

  it('applies the selected vehicle multiplier to package prices', () => {
    expect(calculatePackagePrice('restore', 'compact', publicCatalogFixture)).toMatchObject({
      baseTotal: 279,
      multiplier: 1,
      estimatedTotal: 279,
    })
    expect(calculatePackagePrice('restore', 'large', publicCatalogFixture)).toMatchObject({
      baseTotal: 279,
      multiplier: 1.4,
      estimatedTotal: 390.6,
    })
  })

  it('deduplicates service IDs before calculating totals', () => {
    expect(calculateEstimate(['exterior', 'exterior'], 'compact', publicCatalogFixture).baseTotal).toBe(45)
  })
})
