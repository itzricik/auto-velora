import type { PublicMediaDescriptor } from '../../../src/shared/contracts'
import { hashRateLimitIdentifier } from '../../../src/shared/security'
import type { SupabaseServer } from './supabase'

const BUCKET = 'reservation-media'

type MediaRow = {
  id: string
  reservation_id: string
  storage_path: string
  original_filename: string
  mime_type: PublicMediaDescriptor['mimeType']
  file_size: number
  upload_status: 'pending' | 'ready' | 'failed'
}

function extension(mimeType: PublicMediaDescriptor['mimeType']): string {
  return mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
}

function storagePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

function absoluteStorageUrl(supabaseUrl: string, value: string): string {
  if (/^https:\/\//.test(value)) return value
  if (value.startsWith('/storage/v1/')) return `${supabaseUrl}${value}`
  return `${supabaseUrl}/storage/v1${value.startsWith('/') ? value : `/${value}`}`
}

export async function mediaFinalizeToken(secret: string, mediaId: string): Promise<string> {
  return hashRateLimitIdentifier(secret, `reservation-media-finalize:${mediaId}`)
}

export async function prepareCustomerMedia(input: {
  db: SupabaseServer
  supabaseUrl: string
  rateLimitSecret: string
  reservationId: string
  descriptors: PublicMediaDescriptor[]
}) {
  if (!input.descriptors.length) return []
  const desired = input.descriptors.map((item) => ({
    ...item,
    storagePath: `${input.reservationId}/${item.clientId}.${extension(item.mimeType)}`,
  }))
  const existing = await input.db.request<MediaRow[]>(
    `/rest/v1/reservation_media?reservation_id=eq.${input.reservationId}&deleted_at=is.null&select=id,reservation_id,storage_path,original_filename,mime_type,file_size,upload_status`,
  )
  const existingPaths = new Set(existing.map((row) => row.storage_path))
  const inserts = desired.filter((item) => !existingPaths.has(item.storagePath)).map((item) => ({
    reservation_id: input.reservationId,
    storage_path: item.storagePath,
    original_filename: item.filename,
    mime_type: item.mimeType,
    file_size: item.size,
    media_type: 'reference',
    uploaded_by_type: 'customer',
    upload_status: 'pending',
  }))
  if (existing.length + inserts.length > 6) throw new Error('MEDIA_LIMIT_EXCEEDED')
  if (inserts.length) {
    await input.db.request('/rest/v1/reservation_media?on_conflict=storage_path', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(inserts),
    })
  }
  const rows = await input.db.request<MediaRow[]>(
    `/rest/v1/reservation_media?reservation_id=eq.${input.reservationId}&storage_path=in.(${desired.map((item) => item.storagePath).join(',')})&deleted_at=is.null&select=id,reservation_id,storage_path,original_filename,mime_type,file_size,upload_status`,
  )
  const byPath = new Map(rows.map((row) => [row.storage_path, row]))
  const uploads = []
  for (const descriptor of desired) {
    const row = byPath.get(descriptor.storagePath)
    if (!row || row.upload_status === 'ready') continue
    const signed = await input.db.request<{ url?: string; signedUrl?: string; token?: string }>(
      `/storage/v1/object/upload/sign/${BUCKET}/${storagePath(row.storage_path)}`,
      { method: 'POST', body: JSON.stringify({ upsert: false }) },
    )
    const rawUrl = signed.url ?? signed.signedUrl
    if (!rawUrl || !signed.token) throw new Error('MEDIA_SIGNING_FAILED')
    uploads.push({
      mediaId: row.id,
      clientId: descriptor.clientId,
      uploadUrl: absoluteStorageUrl(input.supabaseUrl, rawUrl),
      uploadToken: signed.token,
      storagePath: row.storage_path,
      finalizeToken: await mediaFinalizeToken(input.rateLimitSecret, row.id),
    })
  }
  return uploads
}

export async function finalizeCustomerMedia(input: {
  db: SupabaseServer
  rateLimitSecret: string
  mediaId: string
  token: string
}): Promise<void> {
  const expected = await mediaFinalizeToken(input.rateLimitSecret, input.mediaId)
  if (input.token.length !== expected.length || input.token !== expected) throw new Error('MEDIA_TOKEN_INVALID')
  const rows = await input.db.request<MediaRow[]>(`/rest/v1/reservation_media?id=eq.${input.mediaId}&uploaded_by_type=eq.customer&deleted_at=is.null&select=id,reservation_id,storage_path,original_filename,mime_type,file_size,upload_status&limit=1`)
  if (!rows[0]) throw new Error('MEDIA_NOT_FOUND')
  await input.db.request('/rest/v1/rpc/finalize_reservation_media_upload', {
    method: 'POST',
    body: JSON.stringify({ p_media_id: input.mediaId, p_expected_uploader: 'customer' }),
  })
}

export async function createSignedDownloadUrl(
  db: SupabaseServer,
  supabaseUrl: string,
  path: string,
  expiresIn = 300,
): Promise<string> {
  const result = await db.request<{ signedURL?: string; signedUrl?: string }>(
    `/storage/v1/object/sign/${BUCKET}/${storagePath(path)}`,
    { method: 'POST', body: JSON.stringify({ expiresIn }) },
  )
  const value = result.signedURL ?? result.signedUrl
  if (!value) throw new Error('MEDIA_SIGNING_FAILED')
  return absoluteStorageUrl(supabaseUrl, value)
}

export async function removePrivateMedia(db: SupabaseServer, media: { id: string; storage_path: string }): Promise<void> {
  await db.request(`/storage/v1/object/${BUCKET}/${storagePath(media.storage_path)}`, { method: 'DELETE' })
  await db.request(`/rest/v1/reservation_media?id=eq.${media.id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  })
}
