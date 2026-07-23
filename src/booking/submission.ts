import type { SubmissionMode } from '../config/site'
import { calculateEstimate, type ServiceId } from '../pricing'
import { submitGoogleFormsRequest } from './googleForms'
import type { BookingPayloadInput } from './payload'
import { generateRequestReference } from './reference'

export type BookingSubmissionInput = Omit<BookingPayloadInput, 'requestReference'>

export type BookingSubmissionSummary = {
  requestReference: string
  serviceIds: ServiceId[]
  serviceNames: string[]
  selectedDate: string
  estimatedPrice: number
  estimatedHours: number
  pricingVersion: string
}

export type BookingSubmissionResult =
  | { mode: 'demo'; summary: BookingSubmissionSummary }
  | { mode: 'googleForms'; summary: BookingSubmissionSummary }

type SubmissionDependencies = {
  generateReference?: () => string
  googleFormsTransport?: (input: BookingPayloadInput) => Promise<void>
}

export async function submitBookingRequest(
  mode: SubmissionMode,
  input: BookingSubmissionInput,
  dependencies: SubmissionDependencies = {},
): Promise<BookingSubmissionResult> {
  const requestReference = dependencies.generateReference?.() ?? generateRequestReference()
  const estimate = calculateEstimate(input.serviceIds, input.vehicleId)
  const summary: BookingSubmissionSummary = {
    requestReference,
    serviceIds: [...input.serviceIds],
    serviceNames: [...input.serviceNames],
    selectedDate: input.selectedDate,
    estimatedPrice: estimate.estimatedTotal,
    estimatedHours: estimate.estimatedHours,
    pricingVersion: estimate.pricingVersion,
  }

  if (mode === 'demo') return { mode, summary }

  const transport = dependencies.googleFormsTransport ?? submitGoogleFormsRequest
  await transport({ ...input, requestReference })
  return { mode, summary }
}
