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

async function validateSaveTokenOnServer(input: {
  requestId: string
  presentationId: string
  saveToken: string
}): Promise<SaveTokenValidationResult | null> {
  const url = getSaveTokenValidateUrl()
  if (!url) {
    return null
  }

  const bearer = getSaveTokenValidateBearer()
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": input.requestId,
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    cache: "no-store",
    body: JSON.stringify({
      presentationId: input.presentationId,
      saveToken: input.saveToken,
    }),
  })

  if (!response.ok) {
    return null
  }

  const payload = (await response.json()) as Partial<SaveTokenValidationResult>
  if (!payload.ok) return null
  if (!payload.presentationId || payload.presentationId !== input.presentationId) return null
  if (!payload.userId) return null

  if (payload.expiresAt) {
    const expiresAt = Date.parse(payload.expiresAt)
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
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
      try {
        const validation = await validateSaveTokenOnServer({
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
      } catch (error) {
        console.error(`[bridge/${options.scope}] save-token-validation-failed`, {
          requestId,
          presentationId: saveHeaders.presentationId,
          saveToken: maskSaveToken(saveHeaders.saveToken),
          error: error instanceof Error ? { message: error.message } : "unknown",
        })
      }
    }
  }

  logBridgeUnauthorized(options.scope, requestId, authState)
  return { requestId, enabled: true, authorized: false, authorizationSource: "none" }
}
