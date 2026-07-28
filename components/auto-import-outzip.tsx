"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

type AutoImportOutZipProps = {
  importOutZipFromArrayBuffer: (outZip: ArrayBuffer) => Promise<void>
  currentPresentationId: string | null
  onPresentationIdChange?: (presentationId: string) => void
  onImportStateChange?: (isImporting: boolean) => void
  onImportStart?: () => void
  onImportComplete?: (success: boolean) => void
  onImportError?: (message: string | null) => void
}

type ImportContext = {
  downloadUrl: string
  downloadToken: string
  saveToken: string
  saveEndpoint: string
  presentationId: string
}

function cleanBrowserUrl() {
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.hash}`)
}

async function resolveImportContext(currentPresentationId: string | null): Promise<ImportContext | null> {
  const params = new URLSearchParams(window.location.search)
  const launchId = params.get("launch")
  if (launchId) {
    cleanBrowserUrl()
    const response = await fetch(`/api/bridge/launch/${encodeURIComponent(launchId)}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
    if (!response.ok) {
      throw new Error(response.status === 404 ? "Ссылка на редактор истекла. Откройте презентацию из кабинета еще раз." : "Не удалось открыть презентацию.")
    }
    const payload = (await response.json()) as ImportContext
    if (!payload.downloadUrl || !payload.downloadToken || !payload.saveToken || !payload.saveEndpoint || !payload.presentationId) {
      throw new Error("Сервер вернул неполные данные для открытия презентации.")
    }
    return payload
  }

  const importOutZip = params.get("importOutZip")
  if (!importOutZip) return null

  const downloadToken = params.get("t") ?? ""
  const saveToken = params.get("saveToken") ?? ""
  const saveEndpoint = params.get("saveEndpoint") ?? ""
  const presentationId = params.get("presentationId") ?? currentPresentationId ?? ""
  const sourceUrl = new URL(importOutZip, window.location.origin)
  cleanBrowserUrl()

  if (!downloadToken || !saveToken || !saveEndpoint || !presentationId) {
    throw new Error("Ссылка на редактор неполная. Откройте презентацию из кабинета еще раз.")
  }

  return {
    downloadUrl: sourceUrl.toString(),
    downloadToken,
    saveToken,
    saveEndpoint,
    presentationId,
  }
}

export default function AutoImportOutZip({
  importOutZipFromArrayBuffer,
  currentPresentationId,
  onPresentationIdChange,
  onImportStateChange,
  onImportStart,
  onImportComplete,
  onImportError,
}: AutoImportOutZipProps) {
  const router = useRouter()
  const { toast } = useToast()
  const hasImportedRef = useRef(false)
  const callbacksRef = useRef({
    importOutZipFromArrayBuffer,
    currentPresentationId,
    onPresentationIdChange,
    onImportStateChange,
    onImportStart,
    onImportComplete,
    onImportError,
  })

  callbacksRef.current = {
    importOutZipFromArrayBuffer,
    currentPresentationId,
    onPresentationIdChange,
    onImportStateChange,
    onImportStart,
    onImportComplete,
    onImportError,
  }

  useEffect(() => {
    if (hasImportedRef.current) return
    const params = new URLSearchParams(window.location.search)
    if (!params.has("launch") && !params.has("importOutZip")) return

    const controller = new AbortController()
    let mounted = true

    const run = async () => {
      let importSucceeded = false
      callbacksRef.current.onImportStateChange?.(true)
      callbacksRef.current.onImportStart?.()
      callbacksRef.current.onImportError?.(null)

      try {
        const context = await resolveImportContext(callbacksRef.current.currentPresentationId)
        if (!context || !mounted) return

        const response = await fetch(context.downloadUrl, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${context.downloadToken}` },
        })
        if (!response.ok) {
          throw new Error(`Не удалось загрузить презентацию: HTTP ${response.status}.`)
        }

        const outZip = await response.arrayBuffer()
        if (!mounted) return
        await callbacksRef.current.importOutZipFromArrayBuffer(outZip)
        if (!mounted) return

        sessionStorage.setItem(
          "wpSaveCtx",
          JSON.stringify({
            saveToken: context.saveToken,
            saveEndpoint: context.saveEndpoint,
            presentationId: context.presentationId,
            ts: Date.now(),
          }),
        )
        callbacksRef.current.onPresentationIdChange?.(context.presentationId)
        hasImportedRef.current = true
        importSucceeded = true
        callbacksRef.current.onImportError?.(null)
        router.replace(`${window.location.pathname}${window.location.hash}`)
        toast({ title: "Презентация открыта" })
      } catch (error) {
        if (!mounted) return
        const err = error as { name?: string; message?: string }
        const message = err.name === "AbortError" ? "Импорт отменен." : err.message ?? "Попробуйте снова."
        callbacksRef.current.onImportError?.(message)
        toast({ title: "Не удалось открыть презентацию", description: message, variant: "destructive" })
      } finally {
        if (mounted) {
          callbacksRef.current.onImportStateChange?.(false)
          callbacksRef.current.onImportComplete?.(importSucceeded)
        }
      }
    }

    void run()
    return () => {
      mounted = false
      controller.abort()
    }
  }, [router, toast])

  return null
}
