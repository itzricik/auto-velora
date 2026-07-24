import type { AvailabilitySlot, PublicBookingResult } from '../shared/contracts'

export type ApiBookingState =
  | { status: 'idle'; slots: AvailabilitySlot[] }
  | { status: 'availability_loading'; slots: AvailabilitySlot[] }
  | { status: 'ready'; slots: AvailabilitySlot[]; serverPriceCents: number; serverDurationMinutes: number }
  | { status: 'no_availability'; slots: AvailabilitySlot[] }
  | { status: 'submitting'; slots: AvailabilitySlot[] }
  | { status: 'conflict'; slots: AvailabilitySlot[] }
  | { status: 'success'; slots: AvailabilitySlot[]; result: PublicBookingResult }
  | { status: 'error'; slots: AvailabilitySlot[]; code: string }

export type ApiBookingAction =
  | { type: 'availability_loading' }
  | { type: 'availability_loaded'; slots: AvailabilitySlot[]; priceCents: number; durationMinutes: number }
  | { type: 'submitting' }
  | { type: 'conflict' }
  | { type: 'success'; result: PublicBookingResult }
  | { type: 'error'; code: string }
  | { type: 'reset' }

export const initialApiBookingState: ApiBookingState = { status: 'idle', slots: [] }

export function reduceApiBookingState(state: ApiBookingState, action: ApiBookingAction): ApiBookingState {
  switch (action.type) {
    case 'availability_loading':
      return { status: 'availability_loading', slots: [] }
    case 'availability_loaded':
      return action.slots.length
        ? {
            status: 'ready',
            slots: action.slots,
            serverPriceCents: action.priceCents,
            serverDurationMinutes: action.durationMinutes,
          }
        : { status: 'no_availability', slots: [] }
    case 'submitting':
      return { status: 'submitting', slots: state.slots }
    case 'conflict':
      return { status: 'conflict', slots: [] }
    case 'success':
      return { status: 'success', slots: [], result: action.result }
    case 'error':
      return { status: 'error', slots: state.slots, code: action.code }
    case 'reset':
      return initialApiBookingState
  }
}
