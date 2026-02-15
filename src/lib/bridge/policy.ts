import { checkBridgeAuthorization, getBridgeRequestId, logBridgeUnauthorized } from "@/src/lib/bridge/auth"

type SaveTokenValidationResult = {
  ok: boolean
  presentationId: string
  userId: string
  expiresAt?: string
}

type BridgePolicyOptions = {
  scope: string
  allowSaveFallback?: boolean
}

type BridgePolicyDecision = {
  requestId: string
  enabled: boolean
  authorized: boolean
  authorizationSource: "bridge-token" | "save-token" | "none"
  saveContext?: {
    presentationId: string
    userId: string
    expiresAt?: string
  }
}

function getSaveTokenValidateUrl() {
  return process.env.BRIDGE_SAVE_TOKEN_VALIDATE_URL?.trim() || ""
}

function getSaveTokenValidateBearer() {
  return process.env.BRIDGE_SAVE_TOKEN_VALIDATE_BEARER?.trim() || ""
}

function getSaveTokenValidateTimeoutMs() {
  const raw = process.env.BRIDGE_SAVE_TOKEN_VALIDATE_TIMEOUT_MS
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isNaN(parsed) || parsed <= 0) return 5000
  return parsed
}

function readSaveFallbackHeaders(request: Request) {
  const presentationId = request.headers.get("x-presentation-id")?.trim() || ""
  const saveToken = request.headers.get("x-save-token")?.trim() || ""
  return { presentationId, saveToken }
}

function isSaveFallbackHeaderShapeValid(headers: ReturnType<typeof readSaveFallbackHeaders>) {
  const isPresentationIdValid = /^\d+$/.test(headers.presentationId)
  const isSaveTokenValid = headers.saveToken.length >= 24
  return isPresentationIdValid && isSaveTokenValid
}

function maskSaveToken(token: string) {
  if (!token) return null
  return `${token.slice(0, 4)}***`
}

function logSaveFallbackDiagnostic(
  scope: string,
  requestId: string,
  details: {
    reason:
      | "save-token-validator-misconfigured"
      | "save-token-validator-rejected"
      | "save-token-validator-response-invalid"
      | "save-token-validator-request-failed"
      | "save-fallback-headers-invalid"
    presentationId?: string
    hasSaveToken?: boolean
    validateUrlConfigured?: boolean
    validateStatus?: number
    errorMessage?: string
  },
) {
  console.error(`[bridge/${scope}] save-fallback-denied`, {
    requestId,
    reason: details.reason,
    presentationId: details.presentationId ?? null,
    hasSaveToken: details.hasSaveToken ?? false,
    validateUrlConfigured: details.validateUrlConfigured ?? false,
    validateStatus: details.validateStatus ?? null,
    errorMessage: details.errorMessage ?? null,
  })
}

async function validateSaveTokenOnServer(input: {
  scope: string
  requestId: string
  presentationId: string
  saveToken: string
}): Promise<SaveTokenValidationResult | null> {
  const url = getSaveTokenValidateUrl()
  if (!url) {
    logSaveFallbackDiagnostic(input.scope, input.requestId, {
      reason: "save-token-validator-misconfigured",
      presentationId: input.presentationId,
      hasSaveToken: Boolean(input.saveToken),
      validateUrlConfigured: false,
    })
    return null
  }

  const bearer = getSaveTokenValidateBearer()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), getSaveTokenValidateTimeoutMs())

  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": input.requestId,
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        presentationId: input.presentationId,
        saveToken: input.saveToken,
      }),
    })
  } catch (error) {
    logSaveFallbackDiagnostic(input.scope, input.requestId, {
      reason: "save-token-validator-request-failed",
      presentationId: input.presentationId,
      hasSaveToken: Boolean(input.saveToken),
      validateUrlConfigured: true,
      errorMessage: error instanceof Error ? error.message : "unknown",
    })
    return null
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    logSaveFallbackDiagnostic(input.scope, input.requestId, {
      reason: "save-token-validator-rejected",
      presentationId: input.presentationId,
      hasSaveToken: Boolean(input.saveToken),
      validateUrlConfigured: true,
      validateStatus: response.status,
    })
    return null
  }

  let payload: Partial<SaveTokenValidationResult>
  try {
    payload = (await response.json()) as Partial<SaveTokenValidationResult>
  } catch {
    logSaveFallbackDiagnostic(input.scope, input.requestId, {
      reason: "save-token-validator-response-invalid",
      presentationId: input.presentationId,
      hasSaveToken: Boolean(input.saveToken),
      validateUrlConfigured: true,
      validateStatus: response.status,
    })
    return null
  }

  if (!payload.ok || !payload.presentationId || payload.presentationId !== input.presentationId || !payload.userId) {
    logSaveFallbackDiagnostic(input.scope, input.requestId, {
      reason: "save-token-validator-response-invalid",
      presentationId: input.presentationId,
      hasSaveToken: Boolean(input.saveToken),
      validateUrlConfigured: true,
      validateStatus: response.status,
    })
    return null
  }

  if (payload.expiresAt) {
    const expiresAt = Date.parse(payload.expiresAt)
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      logSaveFallbackDiagnostic(input.scope, input.requestId, {
        reason: "save-token-validator-response-invalid",
        presentationId: input.presentationId,
        hasSaveToken: Boolean(input.saveToken),
        validateUrlConfigured: true,
        validateStatus: response.status,
      })
      return null
    }
  }

  return {
    ok: true,
    presentationId: payload.presentationId,
    userId: payload.userId,
    expiresAt: payload.expiresAt,
  }
}

export async function resolveBridgePolicy(request: Request, options: BridgePolicyOptions): Promise<BridgePolicyDecision> {
  const requestId = getBridgeRequestId(request)
  const authState = checkBridgeAuthorization(request)
  const { enabled, authorized } = authState

  if (!enabled) {
    return { requestId, enabled: false, authorized: false, authorizationSource: "none" }
  }

  if (authorized) {
    return { requestId, enabled: true, authorized: true, authorizationSource: "bridge-token" }
  }

  if (options.allowSaveFallback) {
    const saveHeaders = readSaveFallbackHeaders(request)
    if (isSaveFallbackHeaderShapeValid(saveHeaders)) {
      const validation = await validateSaveTokenOnServer({
        scope: options.scope,
        requestId,
        presentationId: saveHeaders.presentationId,
        saveToken: saveHeaders.saveToken,
      })

      if (validation) {
        return {
          requestId,
          enabled: true,
          authorized: true,
          authorizationSource: "save-token",
          saveContext: {
            presentationId: validation.presentationId,
            userId: validation.userId,
            expiresAt: validation.expiresAt,
          },
        }
      }
    } else {
      logSaveFallbackDiagnostic(options.scope, requestId, {
        reason: "save-fallback-headers-invalid",
        presentationId: saveHeaders.presentationId || undefined,
        hasSaveToken: Boolean(saveHeaders.saveToken),
        validateUrlConfigured: Boolean(getSaveTokenValidateUrl()),
      })
    }
  }

  logBridgeUnauthorized(options.scope, requestId, authState)
  return { requestId, enabled: true, authorized: false, authorizationSource: "none" }
}

export function __private_for_tests_only__maskSaveToken(token: string) {
  return maskSaveToken(token)
}
