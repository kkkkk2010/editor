import Redis from "ioredis"

let client: Redis | null | undefined

export function bridgeStateBackend(): "memory" | "redis" {
  const configured = process.env.BRIDGE_STATE_BACKEND?.trim().toLowerCase()
  if (configured === "memory") return "memory"
  if (configured === "redis") return "redis"
  return process.env.BRIDGE_REDIS_URL?.trim() ? "redis" : "memory"
}

export function getBridgeRedis(): Redis | null {
  if (bridgeStateBackend() === "memory") return null
  if (client !== undefined) return client

  const url = process.env.BRIDGE_REDIS_URL?.trim()
  if (!url) throw new Error("BRIDGE_REDIS_URL is required when BRIDGE_STATE_BACKEND=redis")
  client = new Redis(url, {
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000,
  })
  client.on("error", (error) => {
    console.error(JSON.stringify({ event: "bridge.redis_error", errorCode: error.name }))
  })
  return client
}

export async function ensureBridgeRedis(): Promise<Redis | null> {
  const redis = getBridgeRedis()
  if (!redis) return null
  if (redis.status === "wait") await redis.connect()
  return redis
}

export function bridgeRedisKey(kind: "launch" | "job", id: string): string {
  return `presentonika:bridge:${kind}:${id}`
}

