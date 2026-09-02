import net from "node:net"
import { dnsLookupAll } from "@/src/lib/net/dnsLookup"

function errorBody(code: string, message: string) {
  return {
    code,
    message,
    requestId: undefined,
    httpStatus: undefined,
    targetUrl: undefined,
    details: undefined,
  }
}

export function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map((part) => Number.parseInt(part, 10))
    if (parts[0] === 10) return true
    if (parts[0] === 127) return true
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 0) return true
    if (parts[0] === 192 && parts[1] === 0 && (parts[2] === 0 || parts[2] === 2)) return true
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true
    if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true
    if (parts[0] >= 224) return true
    return false
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase()
    if (normalized === "::1") return true
    if (normalized === "::") return true
    if (normalized.startsWith("::ffff:")) return isPrivateIp(normalized.slice("::ffff:".length))
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true
    if (/^fe[89ab]/.test(normalized)) return true
    if (normalized.startsWith("2001:db8")) return true
    if (normalized.startsWith("ff")) return true
    return false
  }

  return true
}

export async function assertPublicUrl(rawUrl: string, invalidUrlMessage = "Invalid URL.") {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Response(JSON.stringify(errorBody("INVALID_URL", invalidUrlMessage)), { status: 400 })
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Response(JSON.stringify(errorBody("INVALID_URL", "Only http/https URLs are allowed.")), {
      status: 400,
    })
  }

  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Response(JSON.stringify(errorBody("INVALID_URL", "Only HTTPS URLs are allowed.")), { status: 400 })
  }

  const hostname = parsed.hostname.toLowerCase()
  if (hostname === "localhost") {
    throw new Response(JSON.stringify(errorBody("INVALID_URL", "Blocked host.")), { status: 400 })
  }

  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    throw new Response(JSON.stringify(errorBody("INVALID_URL", "Blocked host.")), { status: 400 })
  }

  try {
    const resolved = await dnsLookupAll(hostname)
    if (!resolved.length || resolved.some((item) => isPrivateIp(item.address))) {
      throw new Error("Blocked host")
    }
  } catch {
    throw new Response(JSON.stringify(errorBody("INVALID_URL", "Blocked host.")), { status: 400 })
  }

  return parsed
}

export function sanitizeUrlForLogs(rawUrl?: string) {
  if (!rawUrl) return undefined
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return undefined
  }
}
