import { describe, expect, it } from 'vitest'
import { generateRequestReference, isRequestReference } from './reference'

describe('booking request references', () => {
  it('creates a human-readable reference with the submission year', () => {
    const reference = generateRequestReference(
      new Date('2026-07-23T09:00:00Z'),
      new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]),
    )

    expect(reference).toBe('VEL-2026-ABCDEFGH')
    expect(isRequestReference(reference)).toBe(true)
  })

  it('rejects malformed references', () => {
    expect(isRequestReference('VEL-2026-ABC')).toBe(false)
    expect(isRequestReference('BOOKING-2026-ABCDEFGH')).toBe(false)
  })
})
