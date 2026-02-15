import dns from "node:dns/promises"

export async function dnsLookupAll(hostname: string) {
  return dns.lookup(hostname, { all: true })
}
