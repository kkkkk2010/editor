import { mkdir, readdir, rm, stat, writeFile, readFile } from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"

export type BridgeJob = {
  id: string
  token: string
  filePath: string
  expiresAt: number
  used: boolean
  requestId?: string
}

const BRIDGE_TMP_DIR = process.env.BRIDGE_TMP_DIR?.trim() || "/tmp/outzips"
const jobs = new Map<string, BridgeJob>()
let cleanupStarted = false

function getTtlSeconds() {
  const raw = process.env.BRIDGE_TTL_SECONDS
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 1800
  }
  return parsed
}

async function ensureDir() {
  await mkdir(BRIDGE_TMP_DIR, { recursive: true })
}

function makeId() {
  return crypto.randomUUID()
}

function makeToken() {
  return crypto.randomBytes(32).toString("base64url")
}

async function removeJob(job: BridgeJob) {
  jobs.delete(job.id)
  await rm(job.filePath, { force: true }).catch(() => undefined)
}

async function cleanupExpiredJobs() {
  const now = Date.now()
  const jobsToDelete: BridgeJob[] = []
  for (const job of jobs.values()) {
    if (job.expiresAt <= now || job.used) {
      jobsToDelete.push(job)
    }
  }

  await Promise.all(jobsToDelete.map((job) => removeJob(job)))

  const ttlMs = getTtlSeconds() * 1000
  const entries = await readdir(BRIDGE_TMP_DIR, { withFileTypes: true }).catch(() => [])
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".zip"))
      .map(async (entry) => {
        const filePath = path.join(BRIDGE_TMP_DIR, entry.name)
        try {
          const fileStat = await stat(filePath)
          if (Date.now() - fileStat.mtimeMs > ttlMs) {
            await rm(filePath, { force: true })
          }
        } catch {
          // ignore cleanup errors
        }
      }),
  )
}

function startCleanup() {
  if (cleanupStarted) return
  cleanupStarted = true
  const intervalMs = Math.max(30_000, Math.floor((getTtlSeconds() * 1000) / 2))
  setInterval(() => {
    void cleanupExpiredJobs()
  }, intervalMs).unref()
}

export async function createBridgeJob(zipBytes: ArrayBuffer, requestId?: string) {
  await ensureDir()
  startCleanup()

  const id = makeId()
  const token = makeToken()
  const filePath = path.join(BRIDGE_TMP_DIR, `${id}.zip`)
  const expiresAt = Date.now() + getTtlSeconds() * 1000

  await writeFile(filePath, Buffer.from(zipBytes))

  const job: BridgeJob = {
    id,
    token,
    filePath,
    expiresAt,
    used: false,
    requestId,
  }
  jobs.set(id, job)

  return {
    jobId: id,
    token,
    expiresAt: new Date(expiresAt).toISOString(),
  }
}

export function getBridgeJob(jobId: string) {
  return jobs.get(jobId)
}

export async function readBridgeZip(job: BridgeJob) {
  return readFile(job.filePath)
}

export async function consumeBridgeJob(job: BridgeJob) {
  job.used = true
  await removeJob(job)
}

export async function pruneBridgeJobs() {
  await ensureDir()
  await cleanupExpiredJobs()
}
