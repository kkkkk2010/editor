"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

type AutoImportOutZipProps = {
  importOutZipFromArrayBuffer: (outZip: ArrayBuffer) => Promise<void>
  onImportStateChange?: (isImporting: boolean) => void
}

export default function AutoImportOutZip({
  importOutZipFromArrayBuffer,
  onImportStateChange,
}: AutoImportOutZipProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  useEffect(() => {
    const importOutZip = searchParams.get("importOutZip")
    if (!importOutZip) {
      return
    }

    const token = searchParams.get("t") ?? ""

    let cancelled = false
    const run = async () => {
      onImportStateChange?.(true)
      try {
        const importUrl = new URL(importOutZip, window.location.origin)
        importUrl.searchParams.set("t", token)

        const response = await fetch(importUrl.toString(), {
          method: "GET",
          cache: "no-store",
        })

        if (!response.ok) {
          throw new Error(`Bridge import failed with status ${response.status}`)
        }

        const outZip = await response.arrayBuffer()
        if (cancelled) {
          return
        }

        await importOutZipFromArrayBuffer(outZip)
        if (!cancelled) {
          const cleanUrl = `${window.location.pathname}${window.location.hash}`
          router.replace(cleanUrl)
          toast({
            title: "Импорт завершен",
            description: "Файл out.zip успешно загружен через bridge.",
          })
        }
      } catch (error) {
        if (!cancelled) {
          toast({
            title: "Не удалось импортировать out.zip",
            description: error instanceof Error ? error.message : "Попробуйте снова.",
            variant: "destructive",
          })
        }
      } finally {
        if (!cancelled) {
          onImportStateChange?.(false)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [importOutZipFromArrayBuffer, onImportStateChange, router, searchParams, toast])

  return null
}
