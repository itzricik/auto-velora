import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { calculateConditionSnapshot, conditionEstimate } from '../src/shared/condition.ts'
import { CURRENT_CONSENT_POLICY_VERSION, parsePublicReservationRequest } from '../src/shared/contracts.ts'
import { createSignedDownloadUrl, finalizeCustomerMedia, mediaFinalizeToken, prepareCustomerMedia } from '../netlify/functions/_lib/media.ts'
import { processReservationNotifications } from '../netlify/functions/_lib/reservation-notifications.ts'

const levelId = '70000000-0000-4000-8000-000000000001'
const indicatorId = '70000000-0000-4000-8000-000000000002'
const baseRequest = {
  name: 'Test Customer', email: 'customer@example.test', phone: '+37120000001',
  vehicleCategoryId: '10000000-0000-4000-8000-000000000001', vehicleDescription: 'Test vehicle',
  serviceIds: ['20000000-0000-4000-8000-000000000001'], requestedStart: '2030-01-02T09:00:00.000Z',
  language: 'en', consentAccepted: true, consentPolicyVersion: CURRENT_CONSENT_POLICY_VERSION,
  idempotencyKey: '30000000-0000-4000-8000-000000000001', overnightAcknowledged: false,
  condition: { levelId, indicatorIds: [indicatorId] },
}

function rule(id, code, minPrice, maxPrice, minDuration, maxDuration) {
  return { id, code, label_en: code, label_lv: code, label_ru: code, explanation_en: '', explanation_lv: '', explanation_ru: '', min_surcharge_cents: minPrice, max_surcharge_cents: maxPrice, min_duration_minutes: minDuration, max_duration_minutes: maxDuration, is_active: true, sort_order: 1, requires_business_confirmation: true }
}

describe('commercial condition assessment', () => {
  test('calculates price and working-time ranges and preserves translated snapshots', () => {
    const snapshot = calculateConditionSnapshot({
      level: rule(levelId, 'heavy', 3000, 9000, 60, 180),
      indicators: [rule(indicatorId, 'pet_hair', 1500, 4000, 30, 90)],
      language: 'en', notes: 'Rear seat',
    })
    assert.equal(snapshot.total_min_surcharge_cents, 4500)
    assert.equal(snapshot.total_max_surcharge_cents, 13000)
    assert.equal(snapshot.customer_notes, 'Rear seat')
    assert.deepEqual(conditionEstimate(12000, 300, snapshot), {
      priceMinCents: 16500, priceMaxCents: 25000,
      durationMinMinutes: 390, durationMaxMinutes: 570,
    })
  })
})

describe('customer media boundary', () => {
  test('accepts six valid images and rejects type, size and count violations', () => {
    const validMedia = Array.from({ length: 6 }, (_, index) => ({
      clientId: `80000000-0000-4000-8000-00000000000${index + 1}`,
      filename: `vehicle-${index + 1}.jpg`, mimeType: 'image/jpeg', size: 1024,
    }))
    assert.equal(parsePublicReservationRequest({ ...baseRequest, media: validMedia }).success, true)
    for (const media of [
      [{ ...validMedia[0], mimeType: 'application/pdf' }],
      [{ ...validMedia[0], size: 8_388_609 }],
      [...validMedia, { ...validMedia[0], clientId: '80000000-0000-4000-8000-000000000007' }],
    ]) assert.equal(parsePublicReservationRequest({ ...baseRequest, media }).success, false)
  })

  test('creates a path-bound signed upload and finalizes only through object verification RPC', async () => {
    const reservationId = '60000000-0000-4000-8000-000000000001'
    const descriptor = { clientId: '80000000-0000-4000-8000-000000000001', filename: 'vehicle.jpg', mimeType: 'image/jpeg', size: 1024 }
    const row = { id: '90000000-0000-4000-8000-000000000001', reservation_id: reservationId, storage_path: `${reservationId}/${descriptor.clientId}.jpg`, original_filename: descriptor.filename, mime_type: descriptor.mimeType, file_size: descriptor.size, upload_status: 'pending' }
    let inserted = false
    const db = { async request(path, init = {}) {
      if (path.includes('reservation_media?reservation_id') && !path.includes('storage_path=in.')) return inserted ? [row] : []
      if (path.startsWith('/rest/v1/reservation_media?on_conflict=')) { inserted = true; return null }
      if (path.includes('storage_path=in.')) return [row]
      if (path.startsWith('/storage/v1/object/upload/sign/')) return { url: `/storage/v1${path.slice('/storage/v1'.length)}`, token: 'signed-upload-token' }
      if (path.startsWith('/rest/v1/reservation_media?id=eq.')) return [row]
      if (path === '/rest/v1/rpc/finalize_reservation_media_upload') {
        assert.deepEqual(JSON.parse(init.body), { p_media_id: row.id, p_expected_uploader: 'customer' }); return row
      }
      throw new Error(`Unexpected ${path}`)
    } }
    const signingSecret = 'test-only-signing-secret-with-at-least-32-characters'
    const uploads = await prepareCustomerMedia({ db, supabaseUrl: 'https://project.supabase.co', rateLimitSecret: signingSecret, reservationId, descriptors: [descriptor] })
    assert.equal(uploads.length, 1)
    assert.equal(uploads[0].storagePath, row.storage_path)
    const token = await mediaFinalizeToken(signingSecret, row.id)
    await finalizeCustomerMedia({ db, rateLimitSecret: signingSecret, mediaId: row.id, token })
  })

  test('requests expiring private download URLs instead of permanent public URLs', async () => {
    const db = { async request(path, init) {
      assert.match(path, /\/storage\/v1\/object\/sign\/reservation-media\//)
      assert.deepEqual(JSON.parse(init.body), { expiresIn: 60 })
      return { signedURL: '/object/sign/reservation-media/file.jpg?token=short-lived' }
    } }
    const value = await createSignedDownloadUrl(db, 'https://project.supabase.co', 'reservation/file.jpg', 60)
    assert.match(value, /token=short-lived/)
    assert.doesNotMatch(value, /\/object\/public\//)
  })
})

function notificationDatabase() {
  const updates = []
  const queued = []
  return {
    updates, queued,
    db: { async request(path, init = {}) {
      if (path === '/rest/v1/rpc/claim_notification_outbox_channel') {
        assert.equal(JSON.parse(init.body).p_channel, 'email')
        return [{ id: 'a0000000-0000-4000-8000-000000000001', reservation_id: '60000000-0000-4000-8000-000000000001', event_type: 'booking_requested', audience: 'customer', recipient: null, language: 'lv', status: 'pending', attempt_count: 1 }]
      }
      if (path.startsWith('/rest/v1/reservations?')) return [{ id: '60000000-0000-4000-8000-000000000001', reference: 'VEL-2030-ABCDEFGH', status: 'pending', starts_at: '2030-01-02T09:00:00.000Z', ends_at: '2030-01-02T11:00:00.000Z', estimated_total_min_cents: 4500, estimated_total_max_cents: 6500, estimated_total_cents: 4500, language: 'lv', customer_id: 'c0000000-0000-4000-8000-000000000001', vehicle_id: 'd0000000-0000-4000-8000-000000000001' }]
      if (path.startsWith('/rest/v1/customers?')) return [{ full_name: 'Customer', phone: '+37120000001', email: 'customer@example.test' }]
      if (path.startsWith('/rest/v1/vehicles?')) return [{ make_model: 'Vehicle' }]
      if (path.startsWith('/rest/v1/reservation_services?')) return [{ service_name_snapshot: 'Detail' }]
      if (path.startsWith('/rest/v1/business_configuration?')) return [{ public_business_name: 'VELORA Detail Lab', review_url: null }]
      if (path.startsWith('/rest/v1/notification_outbox?id=eq.')) { updates.push(JSON.parse(init.body)); return null }
      if (path.startsWith('/rest/v1/notification_outbox?on_conflict=')) { queued.push(JSON.parse(init.body)); return null }
      throw new Error(`Unexpected ${path}`)
    } },
  }
}

describe('isolated notification delivery', () => {
  test('development mode contacts nobody and records suppression', async () => {
    const model = notificationDatabase(); let contacted = false
    const result = await processReservationNotifications(model.db, { mode: 'test', testRecipient: 'sink@example.test' }, null, async () => { contacted = true; throw new Error('unexpected') })
    assert.equal(contacted, false)
    assert.deepEqual(result, { sent: 0, failed: 0, suppressed: 1 })
    assert.equal(model.updates[0].status, 'suppressed')
  })

  test('missing live provider does not throw and queues one idempotent admin failure event', async () => {
    const model = notificationDatabase()
    const result = await processReservationNotifications(model.db, { mode: 'live' })
    assert.equal(result.failed, 1)
    assert.equal(model.queued.length, 1)
    assert.equal(model.queued[0].event_type, 'delivery_failure')
    assert.match(model.queued[0].idempotency_key, /delivery_failure:admin$/)
  })
})
