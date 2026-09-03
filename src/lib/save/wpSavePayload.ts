import { validatePresentationTitle } from "@/src/lib/presentation/title"

export type WpSavePayload = {
  outZipUrl: string
  presentationId: string
  presentationTitle: string
  saveToken: string
  requestId: string
}

export function buildWpSavePayload(input: {
  stagedOutZipUrl: string
  presentationId: string
  presentationTitle: string
  saveToken: string
  requestId: string
}): WpSavePayload {
  return {
    outZipUrl: input.stagedOutZipUrl,
    presentationId: String(input.presentationId),
    presentationTitle: validatePresentationTitle(input.presentationTitle),
    saveToken: String(input.saveToken),
    requestId: String(input.requestId),
  }
}
