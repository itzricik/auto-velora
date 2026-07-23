import { describe, expect, it } from 'vitest'
import {
  calculateEstimate,
  getPackageConsistencyIssues,
  packages,
  vehicleTypes,
} from './pricing'

describe('pricing', () => {
  it('calculates compact and SUV estimates from the same base prices', () => {
    expect(calculateEstimate(['exterior', 'interior'], 'compact')).toMatchObject({
      baseTotal: 165,
      estimatedTotal: 165,
      multiplier: 1,
      estimatedHours: 7,
    })
    expect(calculateEstimate(['exterior', 'interior'], 'suv')).toMatchObject({
      baseTotal: 165,
      estimatedTotal: 206,
      multiplier: 1.25,
      estimatedHours: 9,
    })
  })

  it('uses the documented vehicle multipliers', () => {
    expect(vehicleTypes.map(({ id, multiplier }) => [id, multiplier])).toEqual([
      ['compact', 1],
      ['sedan', 1.1],
      ['suv', 1.25],
      ['large', 1.4],
    ])
  })

  it('keeps package prices positive and below their included base services', () => {
    expect(packages.map((item) => item.price)).toEqual([89, 279, 549])
    expect(getPackageConsistencyIssues()).toEqual([])
  })

  it('deduplicates service IDs before calculating totals', () => {
    expect(calculateEstimate(['exterior', 'exterior'], 'compact').baseTotal).toBe(45)
  })
})
