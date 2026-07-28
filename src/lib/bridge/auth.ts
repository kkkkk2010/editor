import crypto from "node:crypto"

export function getExpectedBridgeToken() {
  return process.env.PRESENTONIKA_BRIDGE_TOKEN?.trim() || process.env.BRIDGE_TOKEN?.trim() || ""
}

export function getBridgeRequestId(request: Request) {
  return request.headers.get("x-request-id")?.trim() || crypto.randomUUID()
}

export function readBridgeAuth(request: Request) {
  const authHeader = request.headers.get("authorization")
  const authScheme = authHeader?.split(" ")[0] ?? null
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : ""

  const fallbackToken = request.headers.get("x-bridge-token")?.trim() || ""

  const cookieHeader = request.headers.get("cookie") ?? ""
  const cookieToken =
    cookieHeader
      .split(";")
      .map((chunk) => chunk.trim())
      .find((chunk) => chunk.startsWith("admin_import="))
      ?.slice("admin_import=".length) ?? ""

  return {
    authHeader,
    authScheme,
    bearerToken,
    fallbackToken,
    cookieToken,
  }
}

export function tokensEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export function checkBridgeAuthorization(request: Request) {
  const expectedToken = getExpectedBridgeToken()
  const auth = readBridgeAuth(request)

  if (!expectedToken) {
    return { enabled: false, authorized: false, auth, expectedToken }
  }

  const providedToken = auth.bearerToken || auth.fallbackToken
  const authorized = tokensEqual(providedToken, expectedToken) || tokensEqual(auth.cookieToken, expectedToken)
  return { enabled: true, authorized, auth, expectedToken }
}

export function logBridgeUnauthorized(scope: string, requestId: string, details: ReturnType<typeof checkBridgeAuthorization>) {
  console.error(`[bridge/${scope}] unauthorized`, {
    requestId,
    hasAuthHeader: Boolean(details.auth.authHeader),
    authScheme: details.auth.authScheme,
    hasCookie: Boolean(details.auth.cookieToken),
    hasProvidedToken: Boolean(details.auth.bearerToken || details.auth.fallbackToken),
    bridgeEnabled: Boolean(details.expectedToken),
  })
}
