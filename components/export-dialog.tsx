"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Download, Loader2 } from "lucide-react"
import type { Slide, SlideSize } from "@/lib/types"
import { exportToPPT } from "@/lib/export-ppt"

interface ExportDialogProps {
  slides: Slide[]
  slideSize: SlideSize
}

export default function ExportDialog({ slides, slideSize }: ExportDialogProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("Презентация технологических продуктов") // Перевел: "科技产品展示之道"
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      await exportToPPT(slides, slideSize, title)
      setOpen(false)
    } catch (error) {
      console.error("导出失败:", error)
      alert("Экспорт не удался, попробуйте снова") // Перевел: "导出失败，请重试"
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Экспорт PPT {/* Перевел: "导出PPT" */}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Экспорт презентации</DialogTitle> {/* Перевел: "导出演示文稿" */}
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Название презентации</Label> {/* Перевел: "演示文稿标题" */}
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Введите название" /> {/* Перевел: "输入标题" */}
          </div>

          <div className="text-sm text-muted-foreground">
            <p>Информация об экспорте:</p> {/* Перевел: "导出信息:" */}
            <ul className="list-disc list-inside mt-1">
              <li>Количество слайдов: {slides.length}</li> {/* Перевел: "幻灯片数量:" */}
              <li>
                Размер слайда: {slideSize.width} x {slideSize.height} {/* Перевел: "幻灯片尺寸:" */}
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена {/* Перевел: "取消" */}
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Экспорт... {/* Перевел: "导出中..." */}
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Экспорт PPT {/* Перевел: "导出PPT" */}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}