"use client"

import type { ReactNode } from "react"
import { useIsMobile } from "@/components/ui/use-mobile"

interface EditorLayoutProps {
  sidebar: ReactNode
  editor: ReactNode
  propertyPanel: ReactNode
  showPropertyPanel: boolean
}

export default function EditorLayout({ sidebar, editor, propertyPanel, showPropertyPanel }: EditorLayoutProps) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="editor-panel max-h-48 shrink-0 overflow-auto border-b">{sidebar}</div>
        <div className="min-h-0 flex-1 overflow-auto">{editor}</div>
        {showPropertyPanel ? (
          <div className="editor-panel max-h-[45vh] shrink-0 overflow-hidden border-t">{propertyPanel}</div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0">
      <aside className="editor-panel w-52 shrink-0 border-r" aria-label="Слайды презентации">
        {sidebar}
      </aside>
      <section className="min-w-0 flex-1 overflow-hidden" aria-label="Рабочая область">
        {editor}
      </section>
      {showPropertyPanel ? (
        <aside className="editor-panel w-72 shrink-0 border-l" aria-label="Свойства элемента">
          {propertyPanel}
        </aside>
      ) : null}
    </div>
  )
}
