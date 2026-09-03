import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import TitleEditor from "@/components/title-editor"

describe("TitleEditor", () => {
  afterEach(() => {
    cleanup()
  })

  it("uses the latest imported title when rename mode opens", () => {
    const onTitleChange = vi.fn()
    const view = render(
      <TitleEditor title="Презентация" onTitleChange={onTitleChange} />,
    )

    view.rerender(
      <TitleEditor
        title="QA DeepSeek C: повтор структуры — закон Архимеда"
        onTitleChange={onTitleChange}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Переименовать презентацию" }))

    const input = screen.getByRole("textbox", { name: "Название презентации" }) as HTMLInputElement
    expect(input.value).toBe("QA DeepSeek C: повтор структуры — закон Архимеда")
    expect(input.maxLength).toBe(200)
  })
})
