type ErrorContext = Record<string, unknown>

export function logStructuredError(event: string, details: ErrorContext) {
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  }
  console.error(JSON.stringify(payload))
}

export function reportError(error: unknown, details?: ErrorContext) {
  const sentry = (globalThis as { Sentry?: { captureException: (err: unknown, context?: unknown) => void } }).Sentry
  if (sentry?.captureException) {
    try {
      sentry.captureException(error, details ? { extra: details } : undefined)
      return
    } catch {
      // Fall through to console logging below.
    }
  }

  const message = error instanceof Error ? error.message : String(error)
  logStructuredError("error_report", { message, ...details })
}
