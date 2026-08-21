const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function reference(now = new Date()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const suffix = [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join('')
  return `VEL-${now.getUTCFullYear()}-${suffix}`
}
