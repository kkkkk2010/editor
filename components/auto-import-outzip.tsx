"use client"

import { useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

type AutoImportOutZipProps = {
  importOutZipFromArrayBuffer: (outZip: ArrayBuffer) => Promise<void>
  currentPresentationId: string | null
  onImportStateChange?: (isImporting: boolean) => void
  onImportStart?: () => void
  onImportComplete?: (success: boolean) => void
}

type CallbackRefs = {
  importOutZipFromArrayBuffer: (outZip: ArrayBuffer) => Promise<void>
  currentPresentationId: string | null
  onImportStateChange?: (isImporting: boolean) => void
  onImportStart?: () => void
  onImportComplete?: (success: boolean) => void
}

export default function AutoImportOutZip({
  importOutZipFromArrayBuffer,
  currentPresentationId,
  onImportStateChange,
  onImportStart,
  onImportComplete,
}: AutoImportOutZipProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const hasImportedRef = useRef(false)
  const initialUrlRef = useRef<string | null>(null)
  const routerRef = useRef(router)
  const toastRef = useRef(toast)
  const callbackRefs = useRef<CallbackRefs>({
    importOutZipFromArrayBuffer,
    currentPresentationId,
    onImportStateChange,
    onImportStart,
    onImportComplete,
  })

  callbackRefs.current = {
    importOutZipFromArrayBuffer,
    currentPresentationId,
    onImportStateChange,
    onImportStart,
    onImportComplete,
  }
  routerRef.current = router
  toastRef.current = toast

  if (!initialUrlRef.current) {
    const importOutZip = searchParams.get("importOutZip")
    if (importOutZip) {
      const token = searchParams.get("t") ?? ""
      const importUrl = new URL(importOutZip, window.location.origin)
      importUrl.searchParams.set("t", token)
      initialUrlRef.current = importUrl.toString()
      console.log("[auto-import] downloadUrl", initialUrlRef.current)
    }
  }

  useEffect(() => {
    if (!initialUrlRef.current) {
      return
    }

    if (hasImportedRef.current) {
      return
    }

    const controller = new AbortController()
    const mountedRef = { current: true }

    const run = async () => {
      let importSucceeded = false
      callbackRefs.current.onImportStateChange?.(true)
      callbackRefs.current.onImportStart?.()
      try {
        console.log("[auto-import] fetch start")
        const response = await fetch(initialUrlRef.current!, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        })

        if (!response.ok) {
          const contentType = response.headers.get("content-type") ?? ""
          let detail = ""
          if (contentType.includes("application/json")) {
            try {
              const payload = (await response.json()) as { message?: string }
              detail = payload?.message ? ` ${payload.message}` : ""
            } catch {
              detail = ""
            }
          } else {
            try {
              detail = ` ${await response.text()}`
            } catch {
              detail = ""
            }
          }
          throw new Error(`Bridge import failed with status ${response.status}.${detail}`.trim())
        }

        const outZip = await response.arrayBuffer()
        console.log("[auto-import] fetch ok", response.status, outZip.byteLength)
        if (!mountedRef.current) {
          return
        }

        await callbackRefs.current.importOutZipFromArrayBuffer(outZip)
        importSucceeded = true
        hasImportedRef.current = true
        console.log("[auto-import] import done")
        if (mountedRef.current) {
          // WP save ctx persisted because router clean removes query params
          const qs = new URLSearchParams(window.location.search)
          const saveToken = qs.get("saveToken")
          const saveEndpoint = qs.get("saveEndpoint")
          const presentationId = callbackRefs.current.currentPresentationId
          const importOutZip = qs.get("importOutZip")
          const bridgeToken = qs.get("t") ?? ""
          let outZipUrl: string | undefined
          if (importOutZip) {
            const sourceUrl = new URL(importOutZip, window.location.origin)
            sourceUrl.searchParams.set("t", bridgeToken)
            outZipUrl = sourceUrl.toString()
          }
          if (saveToken && saveEndpoint && presentationId) {
            const wpSaveCtx = {
              saveToken,
              saveEndpoint,
              presentationId,
              outZipUrl,
              ts: Date.now(),
            }
            sessionStorage.setItem("wpSaveCtx", JSON.stringify(wpSaveCtx))
            console.log("wpSaveCtx stored", {
              presentationId,
              saveEndpoint,
              saveTokenPrefix: `${saveToken.slice(0, 6)}***`,
            })
          }

          const cleanUrl = `${window.location.pathname}${window.location.hash}`
          routerRef.current.replace(cleanUrl)
          console.log("[auto-import] router clean done")
          toastRef.current({
            title: "Импорт завершен",
            description: "Файл out.zip успешно загружен через bridge.",
          })
        }
      } catch (error) {
        if (mountedRef.current) {
          const err = error as { name?: string; message?: string }
          console.log("[auto-import] error", err?.name, err?.message)
          toastRef.current({
            title: err?.name === "AbortError" ? "Импорт отменен" : "Не удалось импортировать out.zip",
            description: err?.message ?? "Попробуйте снова.",
            variant: "destructive",
          })
        }
      } finally {
        if (mountedRef.current) {
          callbackRefs.current.onImportStateChange?.(false)
          callbackRefs.current.onImportComplete?.(importSucceeded)
        }
      }
    }

    void run()
    return () => {
      mountedRef.current = false
      controller.abort()
    }
  }, [])

  return null
}
