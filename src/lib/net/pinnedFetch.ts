import dns from "node:dns/promises"
import http from "node:http"
import https from "node:https"
import net from "node:net"
import { Readable } from "node:stream"

export type ResolvedPublicAddress = {
  address: string
  family: 4 | 6
}

type PinnedFetchOptions = {
  method?: "GET" | "HEAD"
  headers?: HeadersInit
  signal?: AbortSignal
}

function abortError() {
  const error = new Error("Request aborted")
  error.name = "AbortError"
  return error
}

export function isBlockedNetworkAddress(rawAddress: string) {
  const address = rawAddress.replace(/^\[|\]$/g, "").toLowerCase()
  if (net.isIPv4(address)) {
    const parts = address.split(".").map((part) => Number.parseInt(part, 10))
    if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224) return true
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 192 && parts[1] === 0) return true
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true
    if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true
    return false
  }

  if (net.isIPv6(address)) {
    const mappedIpv4 = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
    if (mappedIpv4) return isBlockedNetworkAddress(mappedIpv4)
    const mappedMarker = address.lastIndexOf("ffff:")
    if (mappedMarker >= 0) {
      const prefix = address.slice(0, mappedMarker).replace(/:/g, "")
      const mappedGroups = address.slice(mappedMarker + 5).split(":")
      if ((!prefix || /^0+$/.test(prefix)) && mappedGroups.length === 2) {
        const high = Number.parseInt(mappedGroups[0], 16)
        const low = Number.parseInt(mappedGroups[1], 16)
        if (Number.isInteger(high) && Number.isInteger(low) && high <= 0xffff && low <= 0xffff) {
          return isBlockedNetworkAddress([
            high >> 8,
            high & 0xff,
            low >> 8,
            low & 0xff,
          ].join("."))
        }
      }
    }
    if (address === "::" || address === "::1") return true
    if (address.startsWith("fc") || address.startsWith("fd")) return true
    if (/^fe[89ab]/.test(address)) return true
    if (address.startsWith("ff") || address.startsWith("2001:db8")) return true
    return false
  }

  return true
}

async function lookupWithAbort(hostname: string, signal?: AbortSignal) {
  if (signal?.aborted) throw abortError()
  const lookup = dns.lookup(hostname, { all: true, verbatim: true })
  if (!signal) return lookup

  return await new Promise<Awaited<typeof lookup>>((resolve, reject) => {
    const handleAbort = () => reject(abortError())
    signal.addEventListener("abort", handleAbort, { once: true })
    lookup.then(resolve, reject).finally(() => signal.removeEventListener("abort", handleAbort))
  })
}

export async function resolvePublicAddresses(url: URL, signal?: AbortSignal): Promise<ResolvedPublicAddress[]> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (net.isIP(hostname)) {
    if (isBlockedNetworkAddress(hostname)) throw new Error("Blocked host")
    return [{ address: hostname, family: net.isIPv6(hostname) ? 6 : 4 }]
  }

  const resolved = await lookupWithAbort(hostname, signal)
  if (!resolved.length || resolved.some(({ address }) => isBlockedNetworkAddress(address))) {
    throw new Error("Host resolves to a blocked address")
  }
  return resolved.map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }))
}

export function buildPinnedRequestOptions(
  url: URL,
  resolved: ResolvedPublicAddress,
  options: PinnedFetchOptions = {},
) {
  const headers = new Headers(options.headers)
  headers.set("host", url.host)
  return {
    protocol: url.protocol,
    hostname: resolved.address,
    port: url.port || undefined,
    method: options.method ?? "GET",
    path: `${url.pathname}${url.search}`,
    headers: Object.fromEntries(headers.entries()),
    family: resolved.family,
    signal: options.signal,
    ...(url.protocol === "https:" && !net.isIP(url.hostname.replace(/^\[|\]$/g, ""))
      ? { servername: url.hostname }
      : {}),
  }
}

function responseHeaders(source: http.IncomingHttpHeaders) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(name, item))
    } else if (value !== undefined) {
      headers.set(name, value)
    }
  }
  return headers
}

async function requestPinnedAddress(
  url: URL,
  resolved: ResolvedPublicAddress,
  options: PinnedFetchOptions,
) {
  const transport = url.protocol === "https:" ? https : http
  const requestOptions = buildPinnedRequestOptions(url, resolved, options)

  return await new Promise<Response>((resolve, reject) => {
    const request = transport.request(requestOptions, (incoming) => {
      const status = incoming.statusCode ?? 502
      const body = [204, 205, 304].includes(status)
        ? null
        : Readable.toWeb(incoming) as ReadableStream<Uint8Array>
      resolve(new Response(body, {
        status,
        statusText: incoming.statusMessage,
        headers: responseHeaders(incoming.headers),
      }))
    })
    request.once("error", reject)
    request.end()
  })
}

export async function fetchPinnedPublicUrl(url: URL, options: PinnedFetchOptions = {}) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed")
  }

  const addresses = await resolvePublicAddresses(url, options.signal)
  let lastError: unknown
  for (const resolved of addresses) {
    try {
      return await requestPinnedAddress(url, resolved, options)
    } catch (error) {
      if (options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Pinned request failed")
}
