const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRequestReference(date = new Date(), randomBytes?: Uint8Array): string {
  const bytes = randomBytes ?? getRandomBytes(8)
  const suffix = Array.from(bytes.slice(0, 8), (byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]).join('')
  return `VEL-${date.getFullYear()}-${suffix}`
}

export function isRequestReference(value: string): boolean {
  return /^VEL-\d{4}-[A-HJ-NP-Z2-9]{8}$/.test(value)
}

function getRandomBytes(length: number): Uint8Array {
  const values = new Uint8Array(length)
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(values)
  for (let index = 0; index < length; index += 1) values[index] = Math.floor(Math.random() * 256)
  return values
}
