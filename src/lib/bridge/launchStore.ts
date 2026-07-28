import crypto from "node:crypto"

export type BridgeLaunch = {
  id: string
  jobId: string
  downloadToken: string
  presentationId: string
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

export function createBridgeLaunch(input: Omit<BridgeLaunch, "id" | "expiresAt">) {
  cleanupExpiredLaunches()
  const launch: BridgeLaunch = {
    ...input,
    id: crypto.randomBytes(32).toString("base64url"),
    expiresAt: Date.now() + getLaunchTtlMs(),
  }
  launches.set(launch.id, launch)
  return launch
}

export function consumeBridgeLaunch(id: string) {
  cleanupExpiredLaunches()
  const launch = launches.get(id)
  if (!launch) return null
  launches.delete(id)
  return launch
}
