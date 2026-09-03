import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Element } from "@/lib/types"

vi.mock("@/components/image-upload-dialog", () => ({
  default: () => React.createElement("div", { "data-testid": "image-upload-dialog" }),
}))

vi.mock("@/src/lib/images/searchContext", () => ({
  buildImageSearchContext: () => ({
    query: "современная архитектура",
    negative: [],
    kind: "photo",
    aspect: "landscape",
    hint: "Подберите подходящее изображение",
    suggestedCount: 8,
  }),
}))

import ImagePropertyPanel from "@/components/property-panel/image-property-panel"

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock)

const element = {
  id: "image-1",
  type: "image",
  content: "/placeholder.jpg",
  assetPath: "assets/images/placeholder.jpg",
  position: { x: 0, y: 0 },
  size: { width: 320, height: 180 },
  style: {},
} as Element

const results = [
  {
    id: "result-1",
    thumbUrl: "https://images.example/one-thumb.jpg",
    imageUrl: "https://images.example/one.jpg",
    pageUrl: "https://source-one.example/page",
    sourceHost: "source-one.example",
  },
  {
    id: "result-2",
    thumbUrl: "https://images.example/two-thumb.jpg",
    imageUrl: "https://images.example/two.jpg",
    pageUrl: "https://source-two.example/page",
    sourceHost: "source-two.example",
  },
]

describe("ImagePropertyPanel image picker", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("keeps all search results available after an image is inserted", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true, results }))
    const onInsertImageFromSearch = vi.fn(async () => {})
    const onPreviewImageFromSearch = vi.fn()
    const baseProps = {
      element,
      onUpdateElement: vi.fn(),
      onPreviewImageFromSearch,
      onInsertImageFromSearch,
      hasPlaceholderReplacement: false,
      presentationId: "123",
      saveToken: "test-save-token",
    }

    const view = render(<ImagePropertyPanel {...baseProps} />)

    fireEvent.click(await screen.findByRole("button", { name: "Искать" }))
    const firstResult = await screen.findByRole("button", { name: "Выбрать изображение с сайта source-one.example" })
    const secondResult = await screen.findByRole("button", { name: "Выбрать изображение с сайта source-two.example" })

    fireEvent.click(firstResult)
    expect(onPreviewImageFromSearch).toHaveBeenCalledWith({
      elementId: "image-1",
      previewUrl: "https://images.example/one.jpg",
      fallbackUrl: "https://images.example/one-thumb.jpg",
    })
    expect(onInsertImageFromSearch).not.toHaveBeenCalled()
    const rightsCheckbox = screen.getByRole("checkbox", { name: /Источник и права на использование/ })
    expect(rightsCheckbox.getAttribute("data-state")).toBe("checked")
    expect(screen.getByRole("link", { name: "Источник" }).getAttribute("href")).toBe(
      "https://source-one.example/page",
    )
    fireEvent.click(screen.getByRole("button", { name: /Подтвердить и вставить/ }))

    await waitFor(() => expect(onInsertImageFromSearch).toHaveBeenCalledTimes(1))
    view.rerender(<ImagePropertyPanel {...baseProps} hasPlaceholderReplacement />)

    expect(firstResult.isConnected).toBe(true)
    expect(secondResult.isConnected).toBe(true)
    expect(screen.getByText("Изображение вставлено")).toBeTruthy()

    fireEvent.click(secondResult)
    expect(screen.getByRole("button", { name: "Выбрать изображение с сайта source-two.example" }).getAttribute("aria-pressed")).toBe("true")
  })

  it("allows a new query for the same placeholder and requests 8 results", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true, results }))
    const onUpdateElement = vi.fn()

    render(
      <ImagePropertyPanel
        element={element}
        onUpdateElement={onUpdateElement}
        presentationId="123"
        saveToken="test-save-token"
      />,
    )

    const searchButton = await screen.findByRole("button", { name: "Искать" })
    fireEvent.click(searchButton)

    await screen.findByRole("button", { name: "Выбрать изображение с сайта source-one.example" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ count: 8 })
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("x-presentation-id")).toBe("123")
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("x-save-token")).toBe("test-save-token")
    expect((searchButton as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(screen.getByLabelText("Поисковый запрос"), { target: { value: "кот" } })
    fireEvent.click(searchButton)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ query: "кот", count: 8 })

    expect(onUpdateElement).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          search: expect.objectContaining({
            requestUsedAt: expect.any(String),
            results,
          }),
        }),
      }),
    )
  })

  it("asks for confirmation before an extra paid search", async () => {
    const paidUsage = {
      allowed: false,
      requiresConfirmation: true,
      charged: false,
      cost: 1,
      quota: 8,
      used: 8,
      remaining: 0,
      pointsBalance: 40,
      plan: "basic",
    }
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(
        { ok: false, scope: "token-confirmation", usage: paidUsage },
        { status: 402 },
      ))
      .mockResolvedValueOnce(Response.json({
        ok: true,
        results,
        usage: { ...paidUsage, allowed: true, requiresConfirmation: false, charged: true, pointsBalance: 39 },
      }))

    render(
      <ImagePropertyPanel
        element={element}
        onUpdateElement={vi.fn()}
        presentationId="123"
        saveToken="test-save-token"
      />,
    )

    fireEvent.click(await screen.findByRole("button", { name: "Искать" }))
    const paidButton = await screen.findByRole("button", { name: "Искать за 1 балл" })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ confirmTokenCharge: false })

    fireEvent.click(paidButton)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ confirmTokenCharge: true })
  })
})
