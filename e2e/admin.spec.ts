import { expect, test } from 'playwright/test'

const bookingId = '50000000-0000-4000-8000-000000000001'

function booking(status: 'requested' | 'confirmed') {
  return {
    id: bookingId,
    reference: 'VEL-2030-ADMIN123',
    status,
    starts_at: '2030-01-02T07:00:00.000Z',
    ends_at: '2030-01-02T09:00:00.000Z',
    estimated_price_cents: 12000,
    estimated_duration_minutes: 120,
    final_price_cents: null,
    vehicle_description: 'Test vehicle',
    customer_notes: null,
    internal_notes: null,
    booking_language: 'en',
    customers: {
      full_name: 'A Test Customer',
      normalized_email: 'customer@example.test',
      normalized_phone: '+37120000001',
    },
    booking_services: [{
      service_name_snapshot: 'Interior Reset',
      unit_price_cents_snapshot: 12000,
      duration_minutes_snapshot: 120,
    }],
    booking_status_history: [{
      previous_status: null,
      new_status: status,
      change_source: 'public_api',
      note: null,
      created_at: '2030-01-01T10:00:00.000Z',
    }],
  }
}

test('signs in through Supabase Auth and confirms a requested booking', async ({ page }) => {
  let status: 'requested' | 'confirmed' = 'requested'

  await page.route('https://supabase.test/auth/v1/token?**', async (route) => {
    await route.fulfill({
      json: {
        access_token: 'opaque-e2e-access-token',
        refresh_token: 'opaque-e2e-refresh-token',
        expires_in: 3600,
      },
    })
  })
  await page.route('**/api/admin-bookings?**', async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.has('id')) {
      await route.fulfill({
        json: {
          booking: booking(status),
          identity: { userId: 'admin-id', role: 'admin', displayName: 'Test Admin' },
          requestId: 'detail-request',
        },
      })
      return
    }
    await route.fulfill({
      json: {
        bookings: [booking(status)],
        hasMore: false,
        page: 0,
        summary: {
          today: 0,
          tomorrow: 1,
          upcoming: 1,
          requested: status === 'requested' ? 1 : 0,
          confirmed: status === 'confirmed' ? 1 : 0,
          cancelled: 0,
        },
        identity: { userId: 'admin-id', role: 'admin', displayName: 'Test Admin' },
        requestId: 'list-request',
      },
    })
  })
  await page.route('**/api/admin-booking-action', async (route) => {
    const body = route.request().postDataJSON() as { status?: string }
    expect(body.status).toBe('confirmed')
    status = 'confirmed'
    await route.fulfill({
      json: { booking: booking(status), requestId: 'update-request' },
    })
  })

  await page.goto('/admin')
  await page.getByLabel('Email').fill('admin@example.test')
  await page.getByLabel('Password').fill('not-a-real-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('VEL-2030-ADMIN123')).toBeVisible()
  await page.getByText('VEL-2030-ADMIN123').click()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start work' })).toBeVisible()

  const persisted = await page.evaluate(() => JSON.stringify({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }))
  expect(persisted).not.toContain('admin@example.test')
  expect(persisted).not.toContain('not-a-real-password')
  expect(persisted).not.toContain('customer@example.test')
})
