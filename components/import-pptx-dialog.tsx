"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Upload } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { convertPptxFile, isConverterClientError } from "@/src/lib/converterClient"

interface ImportPptxDialogProps {
  importOutZipFromArrayBuffer: (outZip: ArrayBuffer) => Promise<void>
  hasUnsavedChanges?: boolean
}

export default function ImportPptxDialog({ importOutZipFromArrayBuffer, hasUnsavedChanges }: ImportPptxDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const { toast } = useToast()

  const handleImport = async () => {
    if (!selectedFile) {
      toast({
        title: "Файл не выбран",
        description: "Выберите PPTX файл для импорта.",
        variant: "destructive",
      })
      return
    }
    if (hasUnsavedChanges) {
      const confirmed = window.confirm("Есть несохраненные изменения. Продолжить импорт и потерять их?")
      if (!confirmed) {
        return
      }
    }

    setIsImporting(true)
    try {
      const outZip = await convertPptxFile(selectedFile)
      await importOutZipFromArrayBuffer(outZip)
      setOpen(false)
      setSelectedFile(null)
      toast({
        title: "Импорт завершен",
        description: "PPTX успешно конвертирован и загружен.",
      })
    } catch (error) {
      if (isConverterClientError(error)) {
        console.error("PPTX convert error:", {
          message: error.message,
          code: error.code,
          requestId: error.requestId,
          httpStatus: error.httpStatus,
          targetUrl: error.targetUrl,
        })
        toast({
          title: "Ошибка конвертации",
          description: `Код: ${error.code}${error.requestId ? `, Request ID: ${error.requestId}` : ""}.`,
          variant: "destructive",
        })
      } else {
        if (error instanceof Error) {
          console.error("PPTX import error:", {
            name: error.name,
            message: error.message,
            stack: error.stack,
          })
        } else {
          console.error("PPTX import error:", { error })
        }
        toast({
          title: "Ошибка импорта",
          description: error instanceof Error ? error.message : "Не удалось импортировать PPTX файл.",
          variant: "destructive",
        })
      }
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-2" />
          Импорт PPTX
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Импорт PPTX</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="import-pptx">PPTX файл</Label>
          <Input
            id="import-pptx"
            type="file"
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
          />
          {selectedFile && <p className="text-sm text-muted-foreground">Выбран файл: {selectedFile.name}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button onClick={handleImport} disabled={isImporting}>
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Импорт...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Импортировать
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
