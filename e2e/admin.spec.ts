import { expect, test } from 'playwright/test'

const adminUrl = 'http://127.0.0.1:4174'
const bayId = '10000000-0000-4000-8000-000000000001'
const categoryId = '20000000-0000-4000-8000-000000000001'
const serviceId = '30000000-0000-4000-8000-000000000001'

test('signs in and creates a duration-based reservation in the separate admin app', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined

  await page.route('**/auth/v1/token?**', async (route) => {
    await route.fulfill({
      json: {
        access_token: 'opaque-e2e-access-token',
        refresh_token: 'opaque-e2e-refresh-token',
        expires_in: 3600,
      },
    })
  })
  await page.route('**/api/schedule?**', async (route) => {
    await route.fulfill({
      json: {
        identity: { userId: 'admin-id', role: 'admin', displayName: 'Test Admin' },
        segments: [],
        blocks: [],
        bays: [{ id: bayId, code: 'bay-1', name: 'Bay 1', is_active: true, sort_order: 1 }],
        businessHours: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          opens_at: '10:00:00',
          closes_at: '20:00:00',
          is_closed: false,
        })),
        exception: null,
        startIntervalMinutes: 30,
        services: [{
          id: serviceId,
          slug: 'interior-reset',
          name_en: 'Interior Reset',
          name_lv: 'Salona atjaunošana',
          name_ru: 'Восстановление салона',
          base_price_cents: 12000,
          base_duration_minutes: 240,
          buffer_minutes: 0,
          is_active: true,
        }],
        vehicleCategories: [{
          id: categoryId,
          code: 'compact',
          name_en: 'Compact',
          price_multiplier: 1,
          duration_multiplier: 1,
        }],
      },
    })
  })
  await page.route('**/api/requests?**', async (route) => {
    await route.fulfill({
      json: {
        identity: { userId: 'admin-id', role: 'admin', displayName: 'Test Admin' },
        requests: [],
      },
    })
  })
  await page.route('**/api/reservation', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    if (body.action === 'preview') {
      const start = String(body.requestedStart)
      const end = new Date(Date.parse(start) + 240 * 60_000).toISOString()
      await route.fulfill({
        json: {
          plan: {
            workBayId: bayId,
            start,
            end,
            durationMinutes: 240,
            availableBayCount: 1,
            segments: [{
              work_bay_id: bayId,
              segment_start: start,
              segment_end: end,
              duration_minutes: 240,
            }],
          },
        },
      })
      return
    }
    submitted = body
    await route.fulfill({
      status: 201,
      json: {
        reservationId: '50000000-0000-4000-8000-000000000001',
        reference: 'VEL-2030-ADMIN123',
        status: 'confirmed',
      },
    })
  })

  await page.goto(adminUrl)
  await page.getByLabel('Email').fill('admin@example.test')
  await page.getByLabel('Password').fill('not-a-real-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Daily schedule' })).toBeVisible()
  await page.getByRole('button', { name: 'Add' }).first().click()
  await page.getByLabel('Customer name').fill('A Test Customer')
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('+371 20 000 001')
  await page.getByLabel('Email optional').fill('customer@example.test')
  await page.getByLabel('Vehicle make and model').fill('Test vehicle')
  const serviceCheckbox = page.getByRole('checkbox', { name: /Interior Reset/ })
  await serviceCheckbox.locator('..').click()
  await expect(serviceCheckbox).toBeChecked()
  await expect(page.getByText('240 minutes · Estimate €120.00')).toBeVisible()
  await expect(page.getByText('Complete plan on Bay 1.')).toBeVisible()
  await page.getByRole('button', { name: 'Save reservation' }).click()
  await expect(page.getByRole('heading', { name: 'Create reservation' })).not.toBeVisible()

  expect(submitted).toMatchObject({
    action: 'save',
    fullName: 'A Test Customer',
    status: 'confirmed',
    workBayId: bayId,
    vehicleCategoryId: categoryId,
    serviceIds: [serviceId],
  })
  expect(submitted).not.toHaveProperty('password')

  const persisted = await page.evaluate(() => JSON.stringify({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }))
  expect(persisted).not.toContain('admin@example.test')
  expect(persisted).not.toContain('not-a-real-password')
  expect(persisted).not.toContain('customer@example.test')
})
