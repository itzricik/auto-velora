import { describe, expect, it } from 'vitest'
import { adminUpdateBooking } from './admin-repository'
import type { SupabaseServer } from './supabase'

const booking = {
  id: 'booking-id',
  reference: 'VEL-2026-ABCDEFGH',
  status: 'confirmed' as const,
  starts_at: '2026-08-01T08:00:00.000Z',
  ends_at: '2026-08-01T10:00:00.000Z',
  estimated_price_cents: 12000,
  estimated_duration_minutes: 120,
  final_price_cents: null,
  vehicle_description: 'Test vehicle',
  customer_notes: null,
  internal_notes: null,
  booking_language: 'en' as const,
  idempotency_key: '00000000-0000-4000-8000-000000000000',
  customers: {
    full_name: 'Test Customer',
    normalized_email: 'test@example.test',
    normalized_phone: '+37120000001',
  },
  booking_services: [],
}

describe('administrator repository', () => {
  it.each([[booking], booking])('accepts Supabase RPC array and object response shapes', async (response) => {
    const db = {
      request: async () => response,
    } as unknown as SupabaseServer

    await expect(adminUpdateBooking(db, {
      bookingId: booking.id,
      changedBy: 'admin-id',
      newStatus: 'confirmed',
    })).resolves.toEqual(booking)
  })
})
