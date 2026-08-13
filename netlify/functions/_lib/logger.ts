type LogFields = {
  requestId: string
  functionName: string
  resultStatus: string
  durationMs: number
  bookingId?: string
  providerOutcome?: string
  errorCode?: string
}

export function logServerResult(fields: LogFields): void {
  console.info(JSON.stringify({
    event: 'function_result',
    ...fields,
  }))
}
