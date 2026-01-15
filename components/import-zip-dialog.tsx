"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Upload } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { importZipFile } from "@/src/lib/import/zipImport"
import { mapImporterToEditor } from "@/src/lib/import/mapImporterToEditor"
import type { ImportResult } from "@/src/lib/import/importerDoc"

interface ImportZipDialogProps {
  onImport: (result: ImportResult, createdUrls: string[]) => void
}

export default function ImportZipDialog({ onImport }: ImportZipDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const { toast } = useToast()

  const handleImport = async () => {
    if (!selectedFile) {
      toast({
        title: "Файл не выбран",
        description: "Выберите ZIP архив для импорта.",
        variant: "destructive",
      })
      return
    }

    setIsImporting(true)
    try {
      const { doc, createdUrls } = await importZipFile(selectedFile)
      const mapped = mapImporterToEditor(doc)
      onImport(mapped, createdUrls)
      setOpen(false)
      setSelectedFile(null)
      toast({
        title: "Импорт завершен",
        description: "Документ успешно загружен.",
      })
    } catch (error) {
      console.error("Zip import error:", error)
      toast({
        title: "Ошибка импорта",
        description: error instanceof Error ? error.message : "Не удалось импортировать ZIP файл.",
        variant: "destructive",
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-2" />
          Импорт
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Импорт презентации</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="import-zip">ZIP файл</Label>
          <Input
            id="import-zip"
            type="file"
            accept="application/zip,.zip"
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
