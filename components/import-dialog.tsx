"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FileJson, Link2, Loader2, Upload } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { validateImporterDoc } from "@/src/lib/import/validateImporterDoc"
import { mapImporterToEditor } from "@/src/lib/import/mapImporterToEditor"
import type { ImportResult } from "@/src/lib/import/importerDoc"

interface ImportDialogProps {
  onImport: (result: ImportResult) => void
}

export default function ImportDialog({ onImport }: ImportDialogProps) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("file")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [url, setUrl] = useState("")
  const [isImporting, setIsImporting] = useState(false)
  const { toast } = useToast()

  const handleImportResult = (result: ImportResult) => {
    onImport(result)
    setOpen(false)
    setSelectedFile(null)
    setUrl("")
  }

  const importPayload = async (payload: unknown, baseUrl?: string) => {
    const validation = validateImporterDoc(payload)
    if (!validation.ok) {
      toast({
        title: "Ошибка импорта",
        description: validation.error,
        variant: "destructive",
      })
      return
    }

    const result = mapImporterToEditor(validation.data, { baseUrl })
    handleImportResult(result)
    toast({
      title: "Импорт завершен",
      description: "Документ успешно загружен.",
    })
  }

  const handleFileImport = async () => {
    if (!selectedFile) {
      toast({
        title: "Файл не выбран",
        description: "Выберите JSON файл для импорта.",
        variant: "destructive",
      })
      return
    }

    setIsImporting(true)
    try {
      const text = await selectedFile.text()
      const payload = JSON.parse(text) as unknown
      await importPayload(payload, window.location.origin)
    } catch (error) {
      console.error("Import file error:", error)
      toast({
        title: "Ошибка импорта",
        description: "Не удалось прочитать JSON файл.",
        variant: "destructive",
      })
    } finally {
      setIsImporting(false)
    }
  }

  const handleUrlImport = async () => {
    if (!url.trim()) {
      toast({
        title: "URL не указан",
        description: "Введите URL для импорта JSON.",
        variant: "destructive",
      })
      return
    }

    setIsImporting(true)
    try {
      const resolvedUrl = new URL(url.trim(), window.location.origin).toString()
      const response = await fetch(resolvedUrl)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const payload = (await response.json()) as unknown
      const baseUrl = new URL(".", resolvedUrl).toString()
      await importPayload(payload, baseUrl)
    } catch (error) {
      console.error("Import URL error:", error)
      toast({
        title: "Ошибка импорта",
        description: "Не удалось загрузить документ по указанному URL.",
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
          <DialogTitle>Импорт документа</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="pt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="file">
              <FileJson className="h-4 w-4 mr-2" />
              Файл
            </TabsTrigger>
            <TabsTrigger value="url">
              <Link2 className="h-4 w-4 mr-2" />
              URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-file">JSON файл</Label>
              <Input
                id="import-file"
                type="file"
                accept="application/json,.json"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground">Выбран файл: {selectedFile.name}</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="url" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-url">URL документа</Label>
              <Input
                id="import-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="/imports/test1/doc.json"
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button onClick={activeTab === "file" ? handleFileImport : handleUrlImport} disabled={isImporting}>
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Импорт...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Импорт
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
