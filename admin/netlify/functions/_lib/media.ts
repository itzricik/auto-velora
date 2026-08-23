import type { Database } from './supabase'

const BUCKET = 'reservation-media'
const types = ['image/jpeg', 'image/png', 'image/webp'] as const

function encoded(path: string) {
  return path.split('/').map(encodeURIComponent).join('/')
}

function absolute(supabaseUrl: string, value: string) {
  if (value.startsWith('https://')) return value
  if (value.startsWith('/storage/v1/')) return `${supabaseUrl}${value}`
  return `${supabaseUrl}/storage/v1${value.startsWith('/') ? value : `/${value}`}`
}

export async function signedDownload(db: Database, supabaseUrl: string, path: string) {
  const result = await db.request<{ signedURL?: string; signedUrl?: string }>(`/storage/v1/object/sign/${BUCKET}/${encoded(path)}`, {
    method: 'POST', body: JSON.stringify({ expiresIn: 300 }),
  })
  const url = result.signedURL ?? result.signedUrl
  if (!url) throw new Error('MEDIA_SIGNING_FAILED')
  return absolute(supabaseUrl, url)
}

export async function prepareAdminUpload(db: Database, supabaseUrl: string, actorId: string, source: Record<string, unknown>) {
  const reservationId = typeof source.reservationId === 'string' ? source.reservationId : ''
  const filename = typeof source.filename === 'string' ? source.filename.trim().slice(0, 200) : ''
  const mimeType = typeof source.mimeType === 'string' ? source.mimeType : ''
  const fileSize = Number(source.fileSize)
  const mediaType = source.mediaType
  if (!/^[0-9a-f-]{36}$/i.test(reservationId) || !filename || !types.includes(mimeType as typeof types[number]) || !Number.isInteger(fileSize) || fileSize < 1 || fileSize > 8_388_608 || !['reference', 'before', 'after'].includes(String(mediaType))) throw new Error('VALIDATION_FAILED')
  const id = crypto.randomUUID()
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
  const path = `${reservationId}/${id}.${extension}`
  await db.request('/rest/v1/reservation_media', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ id, reservation_id: reservationId, storage_path: path, original_filename: filename, mime_type: mimeType, file_size: fileSize, media_type: mediaType, uploaded_by_type: 'admin', uploaded_by: actorId, upload_status: 'pending' }),
  })
  const result = await db.request<{ url?: string; signedUrl?: string; token?: string }>(`/storage/v1/object/upload/sign/${BUCKET}/${encoded(path)}`, {
    method: 'POST', body: JSON.stringify({ upsert: false }),
  })
  const url = result.url ?? result.signedUrl
  if (!url || !result.token) throw new Error('MEDIA_SIGNING_FAILED')
  return { mediaId: id, uploadUrl: absolute(supabaseUrl, url), uploadToken: result.token }
}

export async function finalizeAdminUpload(db: Database, mediaId: string) {
  await db.request('/rest/v1/rpc/finalize_reservation_media_upload', {
    method: 'POST', body: JSON.stringify({ p_media_id: mediaId, p_expected_uploader: 'admin' }),
  })
}

export async function removeMedia(db: Database, media: { id: string; storage_path: string }) {
  await db.request(`/storage/v1/object/${BUCKET}/${encoded(media.storage_path)}`, { method: 'DELETE' })
  await db.request(`/rest/v1/reservation_media?id=eq.${media.id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  })
}
