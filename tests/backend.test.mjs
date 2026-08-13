import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import {
  BOOKING_STATUSES,
  CURRENT_CONSENT_POLICY_VERSION,
  parsePublicBookingRequest,
} from '../src/shared/contracts.ts'
import { calculateServerEstimate } from '../src/shared/pricing.ts'
import { canTransitionBooking } from '../src/shared/status.ts'
import { createProfessionalBooking } from '../netlify/functions/_lib/booking-service.ts'
import createBookingHandler from '../netlify/functions/create-booking.ts'

const validRequest = {
  name: 'Test Customer',
  email: 'CUSTOMER@EXAMPLE.TEST',
  phone: '+371 20 000 001',
  vehicleCategoryId: '10000000-0000-4000-8000-000000000001',
  vehicleDescription: 'Test vehicle',
  serviceIds: ['20000000-0000-4000-8000-000000000001'],
  requestedStart: '2030-01-02T07:00:00.000Z',
  language: 'en',
  consentAccepted: true,
  consentPolicyVersion: CURRENT_CONSENT_POLICY_VERSION,
  idempotencyKey: '30000000-0000-4000-8000-000000000001',
}

describe('public request boundary', () => {
  test('normalizes contact data and discards browser prices', () => {
    const parsed = parsePublicBookingRequest({
      ...validRequest,
      estimatedPriceCents: 1,
      finalPriceCents: 1,
    })
    assert.equal(parsed.success, true)
    if (!parsed.success) return
    assert.equal(parsed.data.email, 'customer@example.test')
    assert.equal(parsed.data.phone, '+37120000001')
    assert.equal('estimatedPriceCents' in parsed.data, false)
  })

  test('rejects missing fields, stale consent, and invalid catalog IDs', () => {
    const parsed = parsePublicBookingRequest({
      ...validRequest,
      vehicleCategoryId: 'compact',
      consentPolicyVersion: 'stale',
    })
    assert.equal(parsed.success, false)
    if (parsed.success) return
    assert.ok(parsed.errors.vehicleCategoryId)
    assert.ok(parsed.errors.consentPolicyVersion)
  })

  test('uses the required professional status lifecycle', () => {
    assert.deepEqual(BOOKING_STATUSES, [
      'new', 'contacted', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show',
    ])
    assert.equal(canTransitionBooking('new', 'contacted'), true)
    assert.equal(canTransitionBooking('contacted', 'confirmed'), true)
    assert.equal(canTransitionBooking('completed', 'confirmed'), false)
  })
})

describe('authoritative pricing and transaction payload', () => {
  test('calculates integer cents and item snapshots', () => {
    const estimate = calculateServerEstimate({
      vehicle: {
        id: 'suv', code: 'suv', name: 'SUV', priceMultiplier: 1.25, durationMultiplier: 1.25,
      },
      services: [
        { id: '1', code: 'exterior', name: 'Exterior', basePriceCents: 4500, baseDurationMinutes: 120 },
        { id: '2', code: 'interior', name: 'Interior', basePriceCents: 12000, baseDurationMinutes: 300 },
      ],
    })
    assert.equal(estimate.priceCents, 20625)
    assert.equal(estimate.durationMinutes, 540)
    assert.deepEqual(estimate.itemPricesCents, { 1: 5625, 2: 15000 })
  })

  test('recalculates from database rows and sends complete snapshots to one RPC', async () => {
    let rpcBody
    const db = {
      async request(path, init = {}) {
        if (path.startsWith('/rest/v1/vehicle_categories')) return [{
          id: validRequest.vehicleCategoryId,
          code: 'compact',
          name_en: 'Compact',
          name_lv: 'Kompakts',
          name_ru: 'Компакт',
          price_multiplier: 1,
          duration_multiplier: 1,
        }]
        if (path.startsWith('/rest/v1/services')) return [{
          id: validRequest.serviceIds[0],
          code: 'exterior',
          name_en: 'Signature Exterior',
          name_lv: 'Virsbūves kopšana',
          name_ru: 'Уход за кузовом',
          base_price_cents: 4500,
          base_duration_minutes: 120,
        }]
        if (path.startsWith('/rest/v1/work_bays')) return [{ id: '40000000-0000-4000-8000-000000000001' }]
        if (path.startsWith('/rest/v1/business_hours')) return [{ weekday: 3, opens_at: '09:00', closes_at: '19:00', is_closed: false }]
        if (path.startsWith('/rest/v1/blocked_periods')) return []
        if (path.startsWith('/rest/v1/booking_requests?status=')) return []
        if (path === '/rest/v1/rpc/create_booking_transactional') {
          rpcBody = JSON.parse(init.body)
          return [{
            booking_id: '60000000-0000-4000-8000-000000000001',
            reference: 'VEL-2030-ABCDEFGH',
            status: 'new',
            starts_at: validRequest.requestedStart,
            ends_at: '2030-01-02T09:30:00.000Z',
            estimated_price_cents: 4500,
            estimated_duration_minutes: 120,
            was_existing: false,
          }]
        }
        throw new Error(`Unexpected database request: ${path}`)
      },
    }

    const result = await createProfessionalBooking({
      request: { ...validRequest, email: 'customer@example.test', phone: '+37120000001' },
      db,
      approvalMode: 'manual',
      studioTimezone: 'Europe/Riga',
      minNoticeHours: 0,
      maxDaysAhead: 90,
      bufferMinutes: 30,
      tokenSecret: 'test-rate-limit-secret',
      requestId: 'request-id',
      now: new Date('2029-12-30T00:00:00.000Z'),
    })

    assert.equal(result.serverPriceCents, 4500)
    assert.equal(rpcBody.p_estimated_price_cents, 4500)
    assert.deepEqual(rpcBody.p_vehicle_snapshot, {
      code: 'compact', name: 'Compact', multiplier: 1,
    })
    assert.deepEqual(rpcBody.p_service_snapshots[0], {
      service_id: validRequest.serviceIds[0],
      service_code: 'exterior',
      service_name: 'Signature Exterior',
      base_price_cents: 4500,
      calculated_price_cents: 4500,
      duration_minutes: 120,
    })
  })
})

describe('create-booking endpoint protection', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => {
    Object.assign(process.env, {
      SUPABASE_URL: 'https://supabase.example.test',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      PUBLIC_SITE_URL: 'https://autodetailing-velora.netlify.app',
      RATE_LIMIT_SECRET: 'test-rate-limit-secret',
    })
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function request(body) {
    return new Request('https://autodetailing-velora.netlify.app/api/create-booking', {
      method: 'POST',
      headers: {
        Origin: 'https://autodetailing-velora.netlify.app',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  }

  test('rejects invalid input before database access', async () => {
    let fetched = false
    globalThis.fetch = async () => { fetched = true; throw new Error('unexpected') }
    const response = await createBookingHandler(request({}))
    assert.equal(response.status, 422)
    assert.equal(fetched, false)
  })

  test('rejects a filled honeypot before database access', async () => {
    let fetched = false
    globalThis.fetch = async () => { fetched = true; throw new Error('unexpected') }
    const response = await createBookingHandler(request({ ...validRequest, company: 'Spam Ltd' }))
    assert.equal(response.status, 400)
    assert.equal(fetched, false)
  })

  test('returns 429 when the atomic database rate limit rejects', async () => {
    globalThis.fetch = async () => new Response('false', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await createBookingHandler(request(validRequest))
    assert.equal(response.status, 429)
  })
})
