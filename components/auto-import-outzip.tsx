"use client"

import { useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"


function maskSensitiveUrlForLog(rawUrl: string | null | undefined) {
  if (!rawUrl) return null
  try {
    const parsed = new URL(rawUrl, window.location.origin)
    ;["saveToken", "t"].forEach((key) => {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, "***")
      }
    })
    return `${parsed.origin}${parsed.pathname}${parsed.search}`
  } catch {
    return "invalid-url"
  }
}

type AutoImportOutZipProps = {
  importOutZipFromArrayBuffer: (outZip: ArrayBuffer) => Promise<void>
  currentPresentationId: string | null
  onImportStateChange?: (isImporting: boolean) => void
  onImportStart?: () => void
  onImportComplete?: (success: boolean) => void
  onImportError?: (message: string | null) => void
}

type CallbackRefs = {
  importOutZipFromArrayBuffer: (outZip: ArrayBuffer) => Promise<void>
  currentPresentationId: string | null
  onImportStateChange?: (isImporting: boolean) => void
  onImportStart?: () => void
  onImportComplete?: (success: boolean) => void
  onImportError?: (message: string | null) => void
}

type InitialSaveCtx = {
  saveToken: string
  saveEndpoint: string
  importOutZip: string
  bridgeToken: string
}

export default function AutoImportOutZip({
  importOutZipFromArrayBuffer,
  currentPresentationId,
  onImportStateChange,
  onImportStart,
  onImportComplete,
  onImportError,
}: AutoImportOutZipProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const hasImportedRef = useRef(false)
  const initialUrlRef = useRef<string | null>(null)
  const initialSaveCtxRef = useRef<InitialSaveCtx | null>(null)
  const routerRef = useRef(router)
  const toastRef = useRef(toast)
  const callbackRefs = useRef<CallbackRefs>({
    importOutZipFromArrayBuffer,
    currentPresentationId,
    onImportStateChange,
    onImportStart,
    onImportComplete,
    onImportError,
  })

  callbackRefs.current = {
    importOutZipFromArrayBuffer,
    currentPresentationId,
    onImportStateChange,
    onImportStart,
    onImportComplete,
    onImportError,
  }
  routerRef.current = router
  toastRef.current = toast

  if (!initialUrlRef.current) {
    const importOutZip = searchParams.get("importOutZip")
    if (importOutZip) {
      const token = searchParams.get("t") ?? ""
      const saveToken = searchParams.get("saveToken") ?? ""
      const saveEndpoint = searchParams.get("saveEndpoint") ?? ""

      if (saveToken && saveEndpoint) {
        initialSaveCtxRef.current = {
          saveToken,
          saveEndpoint,
          importOutZip,
          bridgeToken: token,
        }
      }

      console.log("[auto-import] captured save ctx", {
        hasSaveToken: Boolean(saveToken),
        hasSaveEndpoint: Boolean(saveEndpoint),
        hasImportOutZip: Boolean(importOutZip),
        hasBridgeToken: Boolean(token),
      })

      const importUrl = new URL(importOutZip, window.location.origin)
      importUrl.searchParams.set("t", token)
      initialUrlRef.current = importUrl.toString()
      console.log("[auto-import] downloadUrl", importUrl.pathname)

      const hasSensitiveParams = Boolean(searchParams.get("t") || searchParams.get("saveToken") || searchParams.get("saveEndpoint"))
      if (hasSensitiveParams) {
        const cleanUrl = `${window.location.pathname}${window.location.hash}`
        window.history.replaceState(window.history.state, "", cleanUrl)
      }
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
      callbackRefs.current.onImportError?.(null)
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
        callbackRefs.current.onImportError?.(null)
        console.log("[auto-import] import done")
        if (mountedRef.current) {
          // WP save ctx persisted because router clean removes query params
          const capturedCtx = initialSaveCtxRef.current
          const saveToken = capturedCtx?.saveToken ?? null
          const saveEndpoint = capturedCtx?.saveEndpoint ?? null
          const presentationId = callbackRefs.current.currentPresentationId
          const importOutZip = capturedCtx?.importOutZip ?? null
          const bridgeToken = capturedCtx?.bridgeToken ?? ""
          let outZipUrl: string | undefined
          if (importOutZip) {
            const sourceUrl = new URL(importOutZip, window.location.origin)
            sourceUrl.searchParams.set("t", bridgeToken)
            outZipUrl = sourceUrl.toString()
          }

          console.log("[auto-import] restore save ctx", {
            hasCapturedCtx: Boolean(capturedCtx),
            hasSaveToken: Boolean(saveToken),
            hasSaveEndpoint: Boolean(saveEndpoint),
            hasPresentationId: Boolean(presentationId),
          })

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
              saveEndpoint: maskSensitiveUrlForLog(saveEndpoint),
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
          const errorMessage = err?.message ?? "Попробуйте снова."
          console.log("[auto-import] error", err?.name, errorMessage)
          callbackRefs.current.onImportError?.(errorMessage)
          toastRef.current({
            title: err?.name === "AbortError" ? "Импорт отменен" : "Не удалось импортировать out.zip",
            description: errorMessage,
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
