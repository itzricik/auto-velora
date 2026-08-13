export const START_TIMES = ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00'] as const

export function text(value: unknown, max: number) {
  const result = typeof value === 'string' ? value.trim() : ''
  if (result.length > max) throw new Error('VALIDATION_FAILED')
  return result
}

export function uuid(value: unknown): string {
  const result = text(value, 50)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new Error('VALIDATION_FAILED')
  return result
}

export function date(value: unknown): string {
  const result = text(value, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error('VALIDATION_FAILED')
  return result
}

export function startTime(value: unknown): string {
  const result = text(value, 5)
  if (!(START_TIMES as readonly string[]).includes(result)) throw new Error('VALIDATION_FAILED')
  return result
}

export function integer(value: unknown, min: number, max: number): number {
  const result = Number(value)
  if (!Number.isInteger(result) || result < min || result > max) throw new Error('VALIDATION_FAILED')
  return result
}
