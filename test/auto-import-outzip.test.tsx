import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  toast: vi.fn(),
  cachePresentationSession: vi.fn(async () => undefined),
  deleteCachedPresentationSession: vi.fn(async () => undefined),
  getCachedPresentationSession: vi.fn(async () => null as ArrayBuffer | null),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}))

vi.mock("@/src/lib/browser/presentationSessionCache", () => ({
  cachePresentationSession: mocks.cachePresentationSession,
  deleteCachedPresentationSession: mocks.deleteCachedPresentationSession,
  getCachedPresentationSession: mocks.getCachedPresentationSession,
}))

import AutoImportOutZip from "@/components/auto-import-outzip"

describe("AutoImportOutZip search authorization handoff", () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
    window.history.replaceState({}, "", "/")
    vi.restoreAllMocks()
    mocks.replace.mockReset()
    mocks.toast.mockReset()
    mocks.cachePresentationSession.mockClear()
    mocks.deleteCachedPresentationSession.mockClear()
    mocks.getCachedPresentationSession.mockReset()
    mocks.getCachedPresentationSession.mockResolvedValue(null)
  })

  it("passes the launch save context to the editor as soon as it is resolved", async () => {
    window.history.replaceState({}, "", "/?launch=launch-123")
    const importOutZipFromArrayBuffer = vi.fn(async () => undefined)
    const onPresentationIdChange = vi.fn()
    const onPresentationTitleChange = vi.fn()
    const onSaveContextChange = vi.fn()
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({
        downloadUrl: "/api/bridge/outzip/job-1",
        downloadToken: "download-token",
        saveToken: "save-token-from-launch",
        saveEndpoint: "https://www.presentonika.ru/wp-json/presentonika/v1/save",
        presentationId: "118",
        presentationTitle: "Закон Архимеда",
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04])))

    render(
      <AutoImportOutZip
        importOutZipFromArrayBuffer={importOutZipFromArrayBuffer}
        currentPresentationId={null}
        onPresentationIdChange={onPresentationIdChange}
        onPresentationTitleChange={onPresentationTitleChange}
        onSaveContextChange={onSaveContextChange}
      />,
    )

    await waitFor(() => expect(importOutZipFromArrayBuffer).toHaveBeenCalledTimes(1))
    expect(onSaveContextChange).toHaveBeenCalledWith({
      presentationId: "118",
      saveToken: "save-token-from-launch",
    })
    expect(onPresentationIdChange).toHaveBeenCalledWith("118")
    expect(onPresentationTitleChange).toHaveBeenCalledWith("Закон Архимеда")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("authorization")).toBe("Bearer download-token")
    expect(JSON.parse(String(sessionStorage.getItem("wpSaveCtx")))).toMatchObject({
      presentationId: "118",
      presentationTitle: "Закон Архимеда",
      saveToken: "save-token-from-launch",
    })
    expect(mocks.cachePresentationSession).toHaveBeenCalledWith("118", expect.any(ArrayBuffer))
  })

  it("restores the same presentation from the local session after a reload", async () => {
    const cachedOutZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer
    mocks.getCachedPresentationSession.mockResolvedValue(cachedOutZip)
    sessionStorage.setItem("wpSaveCtx", JSON.stringify({
      presentationId: "118",
      presentationTitle: "Закон Архимеда",
      saveToken: "save-token-from-session",
      saveEndpoint: "https://www.presentonika.ru/wp-json/presentonika/v1/save",
      ts: Date.now(),
    }))
    const importOutZipFromArrayBuffer = vi.fn(async () => undefined)
    const onPresentationIdChange = vi.fn()
    const onPresentationTitleChange = vi.fn()
    const onSaveContextChange = vi.fn()
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ ok: true, presentationId: "118" }),
    )

    render(
      <AutoImportOutZip
        importOutZipFromArrayBuffer={importOutZipFromArrayBuffer}
        currentPresentationId={null}
        onPresentationIdChange={onPresentationIdChange}
        onPresentationTitleChange={onPresentationTitleChange}
        onSaveContextChange={onSaveContextChange}
      />,
    )

    await waitFor(() => expect(importOutZipFromArrayBuffer).toHaveBeenCalledWith(cachedOutZip))
    expect(mocks.getCachedPresentationSession).toHaveBeenCalledWith("118")
    expect(onSaveContextChange).toHaveBeenCalledWith({
      presentationId: "118",
      saveToken: "save-token-from-session",
    })
    expect(onPresentationIdChange).toHaveBeenCalledWith("118")
    expect(onPresentationTitleChange).toHaveBeenCalledWith("Закон Архимеда")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/bridge/session/validate")
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("x-presentation-id")).toBe("118")
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("x-save-token")).toBe("save-token-from-session")
    expect(mocks.toast).toHaveBeenCalledWith({ title: "Презентация восстановлена" })
  })

  it("removes an expired local session before opening the cached presentation", async () => {
    sessionStorage.setItem("wpSaveCtx", JSON.stringify({
      presentationId: "118",
      presentationTitle: "Закон Архимеда",
      saveToken: "expired-save-token",
      saveEndpoint: "https://www.presentonika.ru/wp-json/presentonika/v1/save",
      ts: Date.now(),
    }))
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ ok: false }, { status: 401 }),
    )
    const importOutZipFromArrayBuffer = vi.fn(async () => undefined)

    render(
      <AutoImportOutZip
        importOutZipFromArrayBuffer={importOutZipFromArrayBuffer}
        currentPresentationId={null}
      />,
    )

    await waitFor(() => expect(mocks.deleteCachedPresentationSession).toHaveBeenCalledWith("118"))
    expect(importOutZipFromArrayBuffer).not.toHaveBeenCalled()
    expect(mocks.getCachedPresentationSession).not.toHaveBeenCalled()
    expect(sessionStorage.getItem("wpSaveCtx")).toBeNull()
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Не удалось открыть презентацию",
      variant: "destructive",
    }))
  })
})
