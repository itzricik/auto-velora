import { expect, test } from 'playwright/test'

const reference = 'VEL-2030-ABCDEFGH'
const accessToken = 'test-access-token-which-is-longer-than-32-characters'
const slot = {
  start: '2030-01-02T08:00:00.000Z',
  end: '2030-01-02T10:00:00.000Z',
  displayTime: '10:00',
  estimatedDurationMinutes: 120,
  availableBayCount: 1,
  segments: [{
    start: '2030-01-02T08:00:00.000Z',
    end: '2030-01-02T10:00:00.000Z',
    durationMinutes: 120,
  }],
  continuesNextWorkingDay: false,
}

test('creates a duration-based booking without persisting customer data', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined

  await page.route('**/api/availability?**', async (route) => {
    await route.fulfill({
      json: {
        slots: [slot],
        nearest: slot,
        serverEstimate: { priceCents: 4950, durationMinutes: 120 },
        requestId: 'availability-request',
      },
    })
  })
  await page.route('**/api/create-reservation', async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      status: 201,
      json: {
        reference,
        status: 'pending',
        start: slot.start,
        end: slot.end,
        serverPriceCents: 4950,
        serverDurationMinutes: 120,
        message: 'Your booking request is awaiting studio confirmation.',
        requestId: 'booking-request',
      },
    })
  })

  await page.goto('/#booking')
  const serviceCheckbox = page.getByRole('checkbox', { name: 'Signature Exterior', exact: true })
  await serviceCheckbox.locator('..').click()
  await expect(serviceCheckbox).toBeChecked()
  await expect(page.getByText('10:00', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Choose another date and time' }).click()
  await page.getByLabel('Date').fill('2030-01-02')
  const timeChoice = page.getByRole('radio', { name: /10:00/ })
  await timeChoice.locator('..').click()
  await expect(timeChoice).toBeChecked()
  await page.getByLabel('Full name').fill('A Test Customer')
  await page.getByLabel('Phone').fill('+371 20 000 001')
  await page.getByLabel('Email').fill('customer@example.test')
  await page.getByLabel('Vehicle make and model').fill('Test vehicle')
  await page.getByText('I agree to the configured privacy notice').click()
  await page.getByRole('button', { name: 'Send booking request' }).click()

  await expect(page.getByRole('heading', { name: 'Booking request received' })).toBeVisible()
  await expect(page.getByText(reference)).toBeVisible()
  expect(submitted).toBeDefined()
  expect(submitted).toMatchObject({
    requestedStart: slot.start,
    overnightAcknowledged: false,
    consentAccepted: true,
  })
  expect(submitted).not.toHaveProperty('estimatedPrice')
  expect(submitted).not.toHaveProperty('finalPrice')
  expect(submitted).not.toHaveProperty('serverPriceCents')

  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }))
  expect(storage.local).toEqual({ 'velora-language': 'en' })
  expect(storage.session).toEqual({})
  expect(JSON.stringify(storage)).not.toContain('customer@example.test')
  expect(JSON.stringify(storage)).not.toContain('+371')
})

test('loads a token-protected booking, removes credentials from the URL and cancels it', async ({ page }) => {
  await page.route('**/api/booking-status?**', async (route) => {
    const url = new URL(route.request().url())
    expect(url.searchParams.get('reference')).toBe(reference)
    expect(url.searchParams.get('token')).toBe(accessToken)
    await route.fulfill({
      json: {
        reference,
        status: 'confirmed',
        start: slot.start,
        end: slot.end,
        estimatedPriceCents: 4950,
        estimatedDurationMinutes: 120,
        vehicleDescription: 'Test vehicle',
        services: [{ service_name_snapshot: 'Signature Exterior' }],
        canCancel: true,
        requestId: 'status-request',
      },
    })
  })
  await page.route('**/api/booking-cancel', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    expect(body).toMatchObject({ reference, token: accessToken })
    await route.fulfill({
      json: {
        reference,
        status: 'cancelled',
        start: slot.start,
        requestId: 'cancel-request',
      },
    })
  })

  await page.goto(`/booking?reference=${reference}&token=${accessToken}`)
  await expect(page).toHaveURL(/\/booking$/)
  await expect(page.getByText('confirmed', { exact: true })).toBeVisible()
  await page.getByLabel('Cancellation reason (optional)').fill('Test cancellation')
  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await expect(page.getByText('The booking was cancelled.')).toBeVisible()
})
