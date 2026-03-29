import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@/components/import-zip-dialog", () => ({
  default: () => <div data-testid="import-zip-dialog" />,
}))
vi.mock("@/components/import-pptx-dialog", () => ({
  default: () => <div data-testid="import-pptx-dialog" />,
}))
vi.mock("@/components/title-editor", () => ({
  default: () => <div data-testid="title-editor" />,
}))
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}))

import Toolbar from "@/components/toolbar"

const baseProps = {
  selectedElement: null,
  onUpdateElement: vi.fn(),
  onAddShape: vi.fn(),
  onAddText: vi.fn(),
  title: "Test",
  onTitleChange: vi.fn(),
  importOutZipFromArrayBuffer: vi.fn(async () => {}),
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  canUndo: false,
  canRedo: false,
  onSaveProject: vi.fn(),
}

describe("Toolbar admin export controls", () => {
  afterEach(() => {
    cleanup()
  })
  it("shows Export out.zip button in admin mode", () => {
    render(
      <Toolbar
        {...baseProps}
        showAdminImportTools
        onExportOutZip={vi.fn()}
        onExportCurrentSlideAsLayout={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "Export out.zip" })).toBeTruthy()
  })

  it("hides Export out.zip button when admin mode is off", () => {
    render(<Toolbar {...baseProps} showAdminImportTools={false} />)
    expect(screen.queryByRole("button", { name: "Export out.zip" })).toBeNull()
  })
})
