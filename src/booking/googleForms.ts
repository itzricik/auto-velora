import { siteConfig } from '../config/site'
import { buildGoogleFormsPayload, type BookingPayloadInput } from './payload'

export function createGoogleFormsRequest(input: BookingPayloadInput) {
  return {
    action: siteConfig.googleForms.action,
    init: {
      method: 'POST',
      mode: 'no-cors',
      body: buildGoogleFormsPayload(input),
    } satisfies RequestInit,
  }
}

export async function submitGoogleFormsRequest(input: BookingPayloadInput): Promise<void> {
  const request = createGoogleFormsRequest(input)
  await fetch(request.action, request.init)
}
