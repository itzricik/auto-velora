import type { BookingStatus } from './contracts'

const transitions: Record<BookingStatus, readonly BookingStatus[]> = {
  requested: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  rejected: [],
  no_show: [],
}

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return transitions[from].includes(to)
}

export function isCancellationAllowed(input: {
  status: BookingStatus
  startsAt: string
  now?: Date
  cancellationHours: number
}): boolean {
  if (input.status !== 'requested' && input.status !== 'confirmed') return false
  const start = Date.parse(input.startsAt)
  if (Number.isNaN(start) || input.cancellationHours < 0) return false
  const now = input.now?.getTime() ?? Date.now()
  return start - now >= input.cancellationHours * 3_600_000
}
