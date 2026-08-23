const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_DIMENSION = 2400
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

export async function prepareVehicleImage(file: File): Promise<File> {
  if (!TYPES.has(file.type)) throw new Error('INVALID_IMAGE_TYPE')
  if (file.size > MAX_FILE_BYTES) throw new Error('IMAGE_TOO_LARGE')
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) return file
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await canvasBlob(canvas, outputType, 0.84)
    if (!blob || blob.size > MAX_FILE_BYTES) return file
    const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 180) || 'vehicle'
    const extension = outputType === 'image/png' ? 'png' : 'jpg'
    return new File([blob], `${baseName}.${extension}`, { type: outputType, lastModified: file.lastModified })
  } catch {
    return file
  }
}

export function imageLimits() {
  return { maxFiles: 6, maxBytes: MAX_FILE_BYTES, acceptedTypes: TYPES }
}
