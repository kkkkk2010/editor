import crypto from "node:crypto"
import { bridgeRedisKey, ensureBridgeRedis } from "./redis"

export type BridgeLaunch = {
  id: string
  jobId: string
  downloadToken: string
  presentationId: string
  presentationTitle?: string
  saveToken: string
  saveEndpoint: string
  expiresAt: number
}

const launches = new Map<string, BridgeLaunch>()

function getLaunchTtlMs() {
  const parsed = Number.parseInt(process.env.BRIDGE_LAUNCH_TTL_SECONDS ?? "", 10)
  return (Number.isFinite(parsed) && parsed > 0 ? parsed : 300) * 1000
}

function cleanupExpiredLaunches() {
  const now = Date.now()
  for (const [id, launch] of launches) {
    if (launch.expiresAt <= now) launches.delete(id)
  }
}

export async function createBridgeLaunch(input: Omit<BridgeLaunch, "id" | "expiresAt">) {
  cleanupExpiredLaunches()
  const ttlMs = getLaunchTtlMs()
  const launch: BridgeLaunch = {
    ...input,
    id: crypto.randomBytes(32).toString("base64url"),
    expiresAt: Date.now() + ttlMs,
  }
  const redis = await ensureBridgeRedis()
  if (redis) {
    const stored = await redis.set(
      bridgeRedisKey("launch", launch.id),
      JSON.stringify(launch),
      "PX",
      ttlMs,
      "NX",
    )
    if (stored !== "OK") throw new Error("Bridge launch ID collision")
  } else {
    launches.set(launch.id, launch)
  }
  return launch
}

export async function consumeBridgeLaunch(id: string) {
  cleanupExpiredLaunches()
  const redis = await ensureBridgeRedis()
  if (redis) {
    const raw = await redis.eval(
      "local v=redis.call('GET',KEYS[1]); if v then redis.call('DEL',KEYS[1]); end; return v",
      1,
      bridgeRedisKey("launch", id),
    )
    if (typeof raw !== "string") return null
    const launch = JSON.parse(raw) as BridgeLaunch
    return launch.expiresAt > Date.now() ? launch : null
  }
  const launch = launches.get(id)
  if (!launch) return null
  launches.delete(id)
  return launch
}
