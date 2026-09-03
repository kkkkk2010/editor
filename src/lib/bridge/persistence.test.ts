import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let bridgeTmpDir = ""

beforeEach(async () => {
  bridgeTmpDir = await mkdtemp(path.join(tmpdir(), "presentonika-bridge-test-"))
  process.env.BRIDGE_STATE_BACKEND = "memory"
  process.env.BRIDGE_TMP_DIR = bridgeTmpDir
  process.env.BRIDGE_MAX_DOWNLOADS = "2"
  vi.resetModules()
})

afterEach(async () => {
  delete process.env.BRIDGE_STATE_BACKEND
  delete process.env.BRIDGE_TMP_DIR
  delete process.env.BRIDGE_MAX_DOWNLOADS
  await rm(bridgeTmpDir, { recursive: true, force: true })
})

describe("bridge persistent-state contract", () => {
  it("consumes a launch exactly once", async () => {
    const { createBridgeLaunch, consumeBridgeLaunch } = await import("./launchStore")
    const launch = await createBridgeLaunch({
      jobId: "job-1",
      downloadToken: "download-token",
      presentationId: "42",
      saveToken: "save-token",
      saveEndpoint: "https://www.presentonika.ru/save",
    })

    await expect(consumeBridgeLaunch(launch.id)).resolves.toMatchObject({ jobId: "job-1" })
    await expect(consumeBridgeLaunch(launch.id)).resolves.toBeNull()
  })

  it("enforces the download limit atomically through the store API", async () => {
    const { createJobFromZipBytes, getBridgeJob, incrementBridgeDownloads, readBridgeZip } = await import("./store")
    const created = await createJobFromZipBytes(Buffer.from("zip-bytes"))
    const job = await getBridgeJob(created.jobId)
    expect(job).toBeDefined()
    if (!job) return

    await expect(incrementBridgeDownloads(job)).resolves.toBe(1)
    await expect(incrementBridgeDownloads(job)).resolves.toBe(2)
    await expect(incrementBridgeDownloads(job)).resolves.toBeNull()
    await expect(readBridgeZip(job)).resolves.toEqual(Buffer.from("zip-bytes"))
  })
})
