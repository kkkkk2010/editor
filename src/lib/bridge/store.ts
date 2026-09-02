import { mkdir, readdir, rm, stat, writeFile, readFile } from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"

export type BridgeJob = {
  id: string
  token: string
  filePath: string
  createdAt: number
  expiresAt: number
  maxDownloads: number
  downloadsUsed: number
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

function getMaxDownloads() {
  const raw = process.env.BRIDGE_MAX_DOWNLOADS
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 5
  }
  return parsed
}

function getExpiredRetentionSeconds() {
  const raw = process.env.BRIDGE_EXPIRED_RETENTION_SECONDS
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isNaN(parsed) || parsed <= 0) {
    return getTtlSeconds()
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
  const retentionMs = getExpiredRetentionSeconds() * 1000
  const jobsToDelete: BridgeJob[] = []

  for (const job of jobs.values()) {
    if (job.expiresAt + retentionMs <= now) {
      jobsToDelete.push(job)
      continue
    }

    if (job.expiresAt <= now) {
      await rm(job.filePath, { force: true }).catch(() => undefined)
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


export async function createJobFromZipBytes(
  zipBytes: Uint8Array | Buffer,
  meta?: { requestId?: string },
) {
  await ensureDir()
  startCleanup()

  const id = makeId()
  const token = makeToken()
  const filePath = path.join(BRIDGE_TMP_DIR, `${id}.zip`)
  const createdAt = Date.now()
  const expiresAt = createdAt + getTtlSeconds() * 1000

  await writeFile(filePath, zipBytes)

  const job: BridgeJob = {
    id,
    token,
    filePath,
    createdAt,
    expiresAt,
    maxDownloads: getMaxDownloads(),
    downloadsUsed: 0,
    requestId: meta?.requestId,
  }
  jobs.set(id, job)

  return {
    jobId: id,
    token,
    expiresAt: new Date(expiresAt).toISOString(),
  }
}

export async function createBridgeJob(zipBytes: ArrayBuffer, requestId?: string) {
  return createJobFromZipBytes(Buffer.from(zipBytes), { requestId })
}

export function getBridgeJob(jobId: string) {
  return jobs.get(jobId)
}

export async function readBridgeZip(job: BridgeJob) {
  return readFile(job.filePath)
}

export function incrementBridgeDownloads(job: BridgeJob) {
  job.downloadsUsed += 1
  return job.downloadsUsed
}

export async function removeBridgeJob(job: BridgeJob) {
  await removeJob(job)
}

export async function pruneBridgeJobs() {
  await ensureDir()
  await cleanupExpiredJobs()
}
