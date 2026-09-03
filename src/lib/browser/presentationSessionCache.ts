const DB_NAME = "presentonika-editor-session"
const DB_VERSION = 1
const STORE_NAME = "presentations"
export const PRESENTATION_SESSION_TTL_MS = 12 * 60 * 60 * 1000

type PresentationSessionRecord = {
  presentationId: string
  updatedAt: number
  outZip: ArrayBuffer
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null)

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "presentationId" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Не удалось открыть локальное хранилище презентации"))
  })
}

export async function cachePresentationSession(presentationId: string, outZip: ArrayBuffer): Promise<void> {
  if (!presentationId || outZip.byteLength === 0) return
  const database = await openDatabase()
  if (!database) return

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    transaction.objectStore(STORE_NAME).put({
      presentationId,
      updatedAt: Date.now(),
      outZip: outZip.slice(0),
    } satisfies PresentationSessionRecord)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("Не удалось сохранить локальную копию презентации"))
    transaction.onabort = () => reject(transaction.error ?? new Error("Сохранение локальной копии отменено"))
  })
  database.close()
}

export async function getCachedPresentationSession(presentationId: string): Promise<ArrayBuffer | null> {
  if (!presentationId) return null
  const database = await openDatabase()
  if (!database) return null

  const record = await new Promise<PresentationSessionRecord | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly")
    const request = transaction.objectStore(STORE_NAME).get(presentationId)
    request.onsuccess = () => resolve(request.result as PresentationSessionRecord | undefined)
    request.onerror = () => reject(request.error ?? new Error("Не удалось прочитать локальную копию презентации"))
  })

  if (!record || Date.now() - record.updatedAt > PRESENTATION_SESSION_TTL_MS) {
    if (record) {
      const transaction = database.transaction(STORE_NAME, "readwrite")
      transaction.objectStore(STORE_NAME).delete(presentationId)
    }
    database.close()
    return null
  }

  const outZip = record.outZip.slice(0)
  database.close()
  return outZip
}

export async function deleteCachedPresentationSession(presentationId: string): Promise<void> {
  if (!presentationId) return
  const database = await openDatabase()
  if (!database) return

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    transaction.objectStore(STORE_NAME).delete(presentationId)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("Не удалось удалить локальную копию презентации"))
    transaction.onabort = () => reject(transaction.error ?? new Error("Удаление локальной копии отменено"))
  })
  database.close()
}
