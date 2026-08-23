import { describe, expect, it } from 'vitest'
import { parsePublicBookingRequest, parsePublicReservationRequest } from './contracts'
import { calculateServerEstimate } from './pricing'
import { createPublicAccessToken, createSecureReference, derivePublicAccessToken, hashPublicAccessToken, hashRateLimitIdentifier } from './security'
import { canTransitionBooking, isCancellationAllowed } from './status'

describe('Phase 2 shared contracts', () => {
  it('normalizes and validates a public booking request', () => {
    const parsed = parsePublicBookingRequest({
      name: ' Anna Bērziņa ',
      email: 'ANNA@EXAMPLE.LV',
      phone: '+371 20 123 456',
      vehicleCategoryId: '11111111-1111-4111-8111-111111111111',
      vehicleDescription: 'Volvo XC60',
      serviceIds: ['22222222-2222-4222-8222-222222222222'],
      requestedStart: '2030-01-02T09:00:00.000Z',
      condition: { levelId: '55555555-5555-4555-8555-555555555555', indicatorIds: [] },
      language: 'lv',
      consentAccepted: true,
      consentPolicyVersion: '2026-08-supabase-v1',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.email).toBe('anna@example.lv')
      expect(parsed.data.phone).toBe('+37120123456')
    }
  })

  it('rejects simultaneous service and package selection', () => {
    const parsed = parsePublicBookingRequest({
      serviceIds: ['22222222-2222-4222-8222-222222222222'],
      packageId: '44444444-4444-4444-8444-444444444444',
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(parsed.errors.services).toBeDefined()
  })

  it('accepts a selected start without trusting a browser-selected price or duration', () => {
    const parsed = parsePublicReservationRequest({
      name: 'Anna Bērziņa',
      email: 'ANNA@EXAMPLE.LV',
      phone: '+371 20 123 456',
      vehicleCategoryId: '11111111-1111-4111-8111-111111111111',
      vehicleDescription: 'Volvo XC60',
      serviceIds: ['22222222-2222-4222-8222-222222222222'],
      language: 'lv',
      consentAccepted: true,
      consentPolicyVersion: '2026-08-supabase-v1',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      requestedStart: '2030-01-02T09:00:00.000Z',
      condition: { levelId: '55555555-5555-4555-8555-555555555555', indicatorIds: [] },
      estimatedPriceCents: 1,
      calculatedDurationMinutes: 1,
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.requestedStart).toBe('2030-01-02T09:00:00.000Z')
      expect(parsed.data).not.toHaveProperty('estimatedPriceCents')
      expect(parsed.data).not.toHaveProperty('calculatedDurationMinutes')
    }
  })

  it('rejects stale or invented consent policy versions', () => {
    const parsed = parsePublicBookingRequest({
      name: 'Test Customer',
      email: 'customer@example.test',
      phone: '+37120000001',
      vehicleCategoryId: '11111111-1111-4111-8111-111111111111',
      vehicleDescription: 'Test vehicle',
      serviceIds: ['22222222-2222-4222-8222-222222222222'],
      requestedStart: '2030-01-02T09:00:00.000Z',
      language: 'en',
      consentAccepted: true,
      consentPolicyVersion: 'made-up-version',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(parsed.errors.consentPolicyVersion).toBeDefined()
  })

  it('discards browser-supplied prices so the server remains authoritative', () => {
    const parsed = parsePublicBookingRequest({
      name: 'Test Customer',
      email: 'customer@example.test',
      phone: '+37120000001',
      vehicleCategoryId: '11111111-1111-4111-8111-111111111111',
      vehicleDescription: 'Test vehicle',
      serviceIds: ['22222222-2222-4222-8222-222222222222'],
      requestedStart: '2030-01-02T09:00:00.000Z',
      language: 'en',
      consentAccepted: true,
      consentPolicyVersion: '2026-08-supabase-v1',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      estimatedPriceCents: 1,
      finalPriceCents: 1,
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty('estimatedPriceCents')
      expect(parsed.data).not.toHaveProperty('finalPriceCents')
    }
  })

  it('calculates integer cents and duration using authoritative multipliers', () => {
    const estimate = calculateServerEstimate({
      vehicle: { id: 'suv', code: 'suv', name: 'SUV', priceMultiplier: 1.25, durationMultiplier: 1.25 },
      services: [
        { id: '1', code: 'exterior', name: 'Exterior', basePriceCents: 4500, baseDurationMinutes: 120 },
        { id: '2', code: 'interior', name: 'Interior', basePriceCents: 12000, baseDurationMinutes: 300 },
      ],
    })
    expect(estimate).toMatchObject({ priceCents: 20625, durationMinutes: 525 })
  })

  it('generates references and hashes but never stores raw tokens', async () => {
    const reference = createSecureReference(new Date('2030-01-01T00:00:00Z'))
    const token = createPublicAccessToken()
    const hash = await hashPublicAccessToken(token)
    expect(reference).toMatch(/^VEL-2030-[A-Z0-9]{8}$/)
    expect(token.length).toBeGreaterThan(32)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).not.toContain(token)
  })

  it('HMAC-hashes rate-limit identifiers', async () => {
    const first = await hashRateLimitIdentifier('a-strong-test-secret', 'email:anna@example.lv')
    const second = await hashRateLimitIdentifier('a-strong-test-secret', 'email:anna@example.lv')
    expect(first).toBe(second)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
  })

  it('derives the same secure access token for an idempotent retry', async () => {
    const first = await derivePublicAccessToken('a-strong-test-secret', '33333333-3333-4333-8333-333333333333')
    const second = await derivePublicAccessToken('a-strong-test-secret', '33333333-3333-4333-8333-333333333333')
    expect(first).toBe(second)
    expect(first.length).toBeGreaterThan(32)
  })

  it('enforces status transitions and cancellation cutoff', () => {
    expect(canTransitionBooking('new', 'contacted')).toBe(true)
    expect(canTransitionBooking('contacted', 'confirmed')).toBe(true)
    expect(canTransitionBooking('completed', 'confirmed')).toBe(false)
    expect(isCancellationAllowed({
      status: 'confirmed',
      startsAt: '2030-01-02T12:00:00Z',
      now: new Date('2030-01-01T12:00:00Z'),
      cancellationHours: 12,
    })).toBe(true)
    expect(isCancellationAllowed({
      status: 'in_progress',
      startsAt: '2030-01-02T12:00:00Z',
      now: new Date('2030-01-01T12:00:00Z'),
      cancellationHours: 12,
    })).toBe(false)
  })
})
