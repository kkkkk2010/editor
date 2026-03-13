"use client"

import type { ReactNode } from "react"
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
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
      <div className="flex h-full flex-col">
        <div className="max-h-48 shrink-0 overflow-auto border-b bg-background">
          {sidebar}
        </div>
        <div className="flex-1 overflow-auto">{editor}</div>
        {showPropertyPanel ? (
          <div className="max-h-[45vh] shrink-0 overflow-hidden border-t bg-background">{propertyPanel}</div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* 左侧幻灯片缩略图面板 (固定宽度) */}
      <div className="w-[16rem] shrink-0 border-r bg-background">
        {sidebar}
      </div>

      <ResizablePanelGroup direction="horizontal" className="h-full flex-1">
        {/* 中间编辑区域 */}
        <ResizablePanel defaultSize={showPropertyPanel ? 60 : 85} minSize={40}>
          <div className="h-full overflow-auto">{editor}</div>
        </ResizablePanel>

        {/* 右侧属性面板 */}
        {showPropertyPanel && (
          <ResizablePanel defaultSize={25} minSize={25} maxSize={25} className="bg-background border-l">
            {propertyPanel}
          </ResizablePanel>
        )}
      </ResizablePanelGroup>
    </div>
  )
}
